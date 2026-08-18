/**
 * Diagnostic report for authorization COVERAGE GAPS and OVERLAPS in existing data.
 *
 * Background: a renewal/new authorization can leave a gap (starts more than one
 * day after the previous same-code auth ends → uncovered days with 0 units) or
 * an overlap (starts on/before the previous ends → two effective at once). The
 * app now warns about these at entry time, but pairs created before that warning
 * (or via import) may already have gaps. This surfaces them so staff can fix the
 * dates on the client's authorizations.
 *
 * REPORT-ONLY by default (never changes data) — matches the "warn, don't
 * auto-change" policy. Pass `--fix-gaps` to CLOSE gaps by extending each prior
 * auth's end date to the day before the next same-code auth's start (the same
 * rule the Renewal button uses). Overlaps are ALWAYS report-only — closing them
 * would mean shortening an auth, which is a judgement call left to staff.
 *
 * A gap/overlap is detected between consecutive same-code, non-archived, active
 * authorizations for the same client (ordered by start date). manualStatus is
 * ignored for pairing so an early-retired auth is still considered — run
 * `fix-early-retired-renewals.js` first so statuses are correct.
 *
 * Usage:
 *   node prisma/report-auth-coverage-gaps.js            # report only
 *   node prisma/report-auth-coverage-gaps.js --fix-gaps # close gaps (not overlaps)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FIX_GAPS = process.argv.includes('--fix-gaps');
const oneDay = 24 * 60 * 60 * 1000;

// Program codes intentionally allow multiple concurrent active authorizations
// (e.g. COPE Personal Care + COPE Homemaker), so gap/overlap detection does not
// apply to them — they are excluded to avoid false positives.
const MULTI_AUTH_CODES = ['COPE', 'PAS'];

function dayMs(d) {
    const x = new Date(d);
    return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}
function iso(d) { return new Date(d).toISOString().slice(0, 10); }
function addDaysStr(d, n) {
    const x = new Date(dayMs(d) + n * oneDay);
    return x.toISOString().slice(0, 10);
}

async function main() {
    const clients = await prisma.client.findMany({
        include: { authorizations: true },
        orderBy: { clientName: 'asc' },
    });

    const gaps = [];
    const overlaps = [];

    for (const client of clients) {
        // Group same-code, non-archived, non-inactive auths that have both dates.
        const byCode = new Map();
        for (const a of client.authorizations || []) {
            if (a.archivedAt) continue;
            if ((a.manualStatus || 'active') === 'inactive') {
                // Include early-retired (inactive but renewed) so gaps are still seen,
                // but skip auths inactivated for a real reason (no successor).
                if (!a.renewedToId) continue;
            }
            if (!a.authorizationStartDate || !a.authorizationEndDate) continue;
            const key = a.serviceCode || '';
            // Skip program codes — multiple concurrent auths are by design.
            if (MULTI_AUTH_CODES.includes(key)) continue;
            if (!byCode.has(key)) byCode.set(key, []);
            byCode.get(key).push(a);
        }
        for (const [code, list] of byCode) {
            list.sort((a, b) => dayMs(a.authorizationStartDate) - dayMs(b.authorizationStartDate));
            for (let i = 0; i < list.length - 1; i++) {
                const cur = list[i], next = list[i + 1];
                const gapDays = Math.round((dayMs(next.authorizationStartDate) - dayMs(cur.authorizationEndDate)) / oneDay) - 1;
                if (gapDays > 0) {
                    gaps.push({ client: client.clientName, code, curId: cur.id, curEnd: iso(cur.authorizationEndDate),
                        nextId: next.id, nextStart: iso(next.authorizationStartDate), gapDays });
                } else if (dayMs(next.authorizationStartDate) <= dayMs(cur.authorizationEndDate)) {
                    overlaps.push({ client: client.clientName, code, curId: cur.id, curEnd: iso(cur.authorizationEndDate),
                        nextId: next.id, nextStart: iso(next.authorizationStartDate) });
                }
            }
        }
    }

    console.log(`\n=== Coverage GAPS (${gaps.length}) ===`);
    for (const g of gaps) {
        console.log(`  ${g.client} / ${g.code}: auth #${g.curId} ends ${g.curEnd}, auth #${g.nextId} starts ${g.nextStart} → ${g.gapDays} uncovered day(s)`);
    }
    console.log(`\n=== Coverage OVERLAPS (${overlaps.length}) — report-only ===`);
    for (const o of overlaps) {
        console.log(`  ${o.client} / ${o.code}: auth #${o.curId} ends ${o.curEnd}, auth #${o.nextId} starts ${o.nextStart} (overlap)`);
    }

    if (!FIX_GAPS) {
        console.log(`\nReport only — no changes written. Re-run with --fix-gaps to close gaps by extending each prior auth's end date to the day before the next start.`);
        return;
    }
    if (gaps.length === 0) { console.log('\nNo gaps to close.'); return; }

    console.log(`\nClosing ${gaps.length} gap(s) by extending the prior auth's end date:`);
    for (const g of gaps) {
        const newEnd = addDaysStr(g.nextStart, -1); // day before the next start
        await prisma.authorization.update({
            where: { id: g.curId },
            // Store at UTC midnight so the date does not shift under the process
            // timezone (matches how the app persists authorization dates).
            data: { authorizationEndDate: new Date(newEnd + 'T00:00:00.000Z') },
        });
        await prisma.auditLog.create({
            data: {
                userId: 0, userName: 'system:report-auth-coverage-gaps', userRole: 'system',
                action: 'UPDATE', entityType: 'Authorization', entityId: g.curId, entityName: g.code,
                changes: JSON.stringify([{ field: 'authorizationEndDate', oldValue: g.curEnd, newValue: newEnd }]),
                metadata: JSON.stringify({ reason: 'coverage_gap_backfill', nextAuthId: g.nextId }),
            },
        });
        console.log(`  auth #${g.curId} (${g.code}): end ${g.curEnd} → ${newEnd}`);
    }
    console.log(`\nDone. Closed ${gaps.length} gap(s).`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(async () => { await prisma.$disconnect(); });
