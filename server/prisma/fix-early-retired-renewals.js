/**
 * One-time repair for the "future renewal retired the current auth early" bug.
 *
 * Background: before the fix in `renewAuthorization`, renewing an authorization
 * with a FUTURE start date immediately flipped the renewed-from (current) auth
 * to `manualStatus: 'inactive'`. Because both the server week-filter
 * (`filterAuthsByWeek`) and the client Scheduler reject non-active auths, the
 * current authorization vanished (0 units) in the Scheduler / Care Plan the
 * moment the renewal was entered — even though the replacement had not started
 * yet. The fix keeps the old auth active until the new start date; this script
 * repairs rows that were already broken before the fix shipped.
 *
 * Affected-row signature (all must hold):
 *   - The auth is a renewed-FROM auth: `renewedToId` points at a successor.
 *   - It was retired: `manualStatus = 'inactive'`, not archived.
 *   - The successor has NOT started yet: successor.authorizationStartDate is in
 *     the future (so the old auth should still be the current one).
 *   - The old auth's own window still covers today: its authorizationEndDate is
 *     null OR >= today (the renewal already set it to the day before the new
 *     start, so this is the gap where nothing is showing).
 *
 * Repair: set the old auth back to `manualStatus: 'active'`. Its end date is
 * left untouched (already the day before the new start), so date-range filtering
 * shows it until the successor's start date and then hands over automatically.
 * The successor is left untouched.
 *
 * Safety:
 *   - DRY-RUN by default (reports what would change, writes nothing). Pass
 *     `--apply` to persist.
 *   - Idempotent: re-running after a successful apply finds nothing (the rows
 *     are active again, so they no longer match).
 *   - Never touches archived auths, never changes any end date, never touches
 *     the successor, never reactivates an auth whose window has already ended.
 *   - Writes an AuditLog RESTORE entry per repaired auth when applying.
 *
 * Usage:
 *   node prisma/fix-early-retired-renewals.js            # dry run
 *   node prisma/fix-early-retired-renewals.js --apply    # persist
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Compare on calendar day at UTC midnight so a same-day end date (end === today)
// still counts as covering today, matching `filterAuthsByWeek`'s day-level logic.
function startOfUtcDay(d) {
    const x = d instanceof Date ? d : new Date(d);
    return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

async function main() {
    const now = new Date();
    const todayMs = startOfUtcDay(now);

    // Renewed-from auths that were retired and whose successor hasn't started.
    const candidates = await prisma.authorization.findMany({
        where: {
            manualStatus: 'inactive',
            archivedAt: null,
            renewedToId: { not: null },
        },
        include: { client: { select: { clientName: true } } },
    });

    const toRepair = [];
    for (const a of candidates) {
        const successor = await prisma.authorization.findUnique({
            where: { id: a.renewedToId },
            select: { id: true, authorizationStartDate: true, manualStatus: true, archivedAt: true },
        });
        // No successor row (shouldn't happen), or successor already started → not the bug.
        if (!successor || !successor.authorizationStartDate) continue;
        if (startOfUtcDay(successor.authorizationStartDate) <= todayMs) continue;
        // Old auth's window must still cover today (open-ended or end >= today).
        if (a.authorizationEndDate && startOfUtcDay(a.authorizationEndDate) < todayMs) continue;
        toRepair.push({ auth: a, successor });
    }

    if (toRepair.length === 0) {
        console.log('No early-retired renewals found. Nothing to do.');
        return;
    }

    console.log(`${APPLY ? 'Repairing' : '[DRY RUN] Would repair'} ${toRepair.length} early-retired renewal(s):`);
    for (const { auth, successor } of toRepair) {
        const oldEnd = auth.authorizationEndDate ? auth.authorizationEndDate.toISOString().slice(0, 10) : 'open';
        const newStart = successor.authorizationStartDate.toISOString().slice(0, 10);
        console.log(
            `  - auth #${auth.id} ${auth.client?.clientName || 'client ' + auth.clientId} / ${auth.serviceCode}` +
            ` (${auth.authorizedUnits} units, ends ${oldEnd}) → reactivate; successor #${successor.id} starts ${newStart}`
        );
    }

    if (!APPLY) {
        console.log('\nDry run only — no changes written. Re-run with --apply to persist.');
        return;
    }

    for (const { auth } of toRepair) {
        await prisma.authorization.update({
            where: { id: auth.id },
            data: { manualStatus: 'active' },
        });
        // Audit trail so the History page reflects the correction.
        await prisma.auditLog.create({
            data: {
                userId: 0,
                userName: 'system:fix-early-retired-renewals',
                userRole: 'system',
                action: 'RESTORE',
                entityType: 'Authorization',
                entityId: auth.id,
                entityName: auth.serviceCode || '',
                changes: JSON.stringify([{ field: 'manualStatus', oldValue: 'inactive', newValue: 'active' }]),
                metadata: JSON.stringify({ reason: 'future_renewal_early_retirement_repair', renewedToId: auth.renewedToId }),
            },
        });
    }

    console.log(`\nDone. Reactivated ${toRepair.length} authorization(s).`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(async () => { await prisma.$disconnect(); });
