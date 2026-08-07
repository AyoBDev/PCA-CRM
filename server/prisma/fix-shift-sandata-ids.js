/**
 * One-time cleanup: re-sync each Shift's copied `sandataClientId` with the LIVE
 * value from the client's authorization for that shift's service code.
 *
 * Background: the Sandata Client ID is copied (as free text) onto each shift at
 * creation and can drift from the source of truth (Authorization). The shared
 * schedule view already resolves the ID live at render time, so this script is
 * NOT required for correct display — it exists to clean the underlying shift
 * rows so any other consumer of `Shift.sandataClientId` also sees the right ID.
 *
 * Behaviour:
 *   - A shift is corrected ONLY when its client has an authorization (active
 *     preferred) for the shift's service code with a NON-EMPTY sandataClientId
 *     that differs from the shift's stored value. Shifts with no matching
 *     authorization ID are left untouched — this never blanks a shift out.
 *   - Archived shifts are skipped.
 *   - Idempotent: re-running after a successful apply changes nothing.
 *   - DRY-RUN by default (reports what would change, writes nothing). Pass
 *     `--apply` to persist the corrections.
 *
 * Run:
 *   cd server && node prisma/fix-shift-sandata-ids.js           # dry run
 *   cd server && node prisma/fix-shift-sandata-ids.js --apply   # apply changes
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/lib/prisma');
const { buildLiveSandataMap } = require('../src/lib/sandataResolver');

async function main(apply = process.argv.includes('--apply')) {
    const APPLY = apply;
    const shifts = await prisma.shift.findMany({
        where: { archivedAt: null },
        select: {
            id: true, clientId: true, serviceCode: true, sandataClientId: true, shiftDate: true,
            client: { select: { clientName: true } },
        },
        orderBy: [{ clientId: 'asc' }, { shiftDate: 'asc' }],
    });

    const clientIds = [...new Set(shifts.map(s => s.clientId).filter(Boolean))];
    const auths = clientIds.length
        ? await prisma.authorization.findMany({
            where: { clientId: { in: clientIds }, archivedAt: null },
            select: { clientId: true, serviceCode: true, sandataClientId: true, manualStatus: true },
        })
        : [];

    const liveMap = buildLiveSandataMap(auths);

    const changes = [];
    for (const s of shifts) {
        const live = liveMap[`${s.clientId}|${s.serviceCode}`];
        // Only correct when a live authorization value exists AND differs.
        if (live == null) continue;
        const current = (s.sandataClientId || '').trim();
        if (current === live) continue;
        changes.push({
            shiftId: s.id,
            clientName: s.client?.clientName || `#${s.clientId}`,
            serviceCode: s.serviceCode,
            shiftDate: s.shiftDate ? s.shiftDate.toISOString().split('T')[0] : '',
            oldValue: current || '(blank)',
            newValue: live,
        });
    }

    console.log(`\nShift Sandata ID cleanup — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Shifts scanned: ${shifts.length}, authorizations loaded: ${auths.length}`);
    console.log(`Shifts needing correction: ${changes.length}\n`);

    if (changes.length) {
        console.log('  shiftId | client | serviceCode | date | old -> new');
        for (const c of changes) {
            console.log(`  ${c.shiftId} | ${c.clientName} | ${c.serviceCode} | ${c.shiftDate} | ${c.oldValue} -> ${c.newValue}`);
        }

        // Always write a CSV report for office review, dry-run or apply.
        const outDir = path.join(__dirname, '..', 'tmp');
        fs.mkdirSync(outDir, { recursive: true });
        const csvPath = path.join(outDir, 'shift-sandata-id-cleanup-report.csv');
        const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const csv = ['shiftId,clientName,serviceCode,shiftDate,oldValue,newValue']
            .concat(changes.map(c => [c.shiftId, c.clientName, c.serviceCode, c.shiftDate, c.oldValue, c.newValue].map(esc).join(',')))
            .join('\n');
        fs.writeFileSync(csvPath, csv + '\n');
        console.log(`\nCSV written to ${csvPath}`);
    }

    if (!APPLY) {
        console.log('\nDry run — no changes written. Re-run with --apply to persist.');
        return { scanned: shifts.length, corrected: 0, pending: changes.length };
    }

    let updated = 0;
    for (const c of changes) {
        await prisma.shift.update({
            where: { id: c.shiftId },
            data: { sandataClientId: c.newValue },
        });
        updated++;
    }
    console.log(`\nApplied. Shifts updated: ${updated}`);
    return { scanned: shifts.length, corrected: updated };
}

module.exports = { main };

// Auto-run only when invoked directly (not when required by tests).
if (require.main === module) {
    main()
        .catch((e) => { console.error(e); process.exit(1); })
        .finally(() => prisma.$disconnect());
}
