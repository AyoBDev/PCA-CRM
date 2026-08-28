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
 * Each drifted shift is classified so corrections can be applied in tranches:
 *   - blank_fill_in: shift has no id, auth supplies one (benign).
 *   - cross_client:  shift's id provably belongs to a DIFFERENT client (the
 *                    wrong-client-ID bug class — safe and important to fix).
 *   - value_review:  shift has a different non-blank id not owned by another
 *                    client (typo / leading zero / per-code tangle — REVIEW).
 * Use `--only=cat1,cat2` to restrict which categories are reported/applied.
 * The full report always shows a `category` column so nothing is hidden.
 *
 * Run:
 *   cd server && node prisma/fix-shift-sandata-ids.js                          # dry run, all
 *   cd server && node prisma/fix-shift-sandata-ids.js --only=blank_fill_in,cross_client
 *   cd server && node prisma/fix-shift-sandata-ids.js --only=cross_client --apply
 *   node prisma/fix-shift-sandata-ids.js --decisions=tmp/sandata-owner-review.xlsx          # dry run
 *   node prisma/fix-shift-sandata-ids.js --decisions=tmp/sandata-owner-review.xlsx --apply  # persist owner decisions
 */
const fs = require('fs');
const path = require('path');
const { readSheetObjects } = require('../src/lib/xlsxHelper');
const prisma = require('../src/lib/prisma');
const {
    buildLiveSandataMap,
    buildSandataOwnerMap,
    classifyDrift,
    DRIFT_CATEGORIES,
} = require('../src/lib/sandataResolver');

function parseOnly(argv) {
    const arg = argv.find(a => a === '--only' || a.startsWith('--only='));
    if (!arg) return null; // null = all categories
    const raw = arg.includes('=') ? arg.split('=')[1] : (argv[argv.indexOf(arg) + 1] || '');
    const cats = raw.split(',').map(s => s.trim()).filter(Boolean);
    const invalid = cats.filter(c => !DRIFT_CATEGORIES.includes(c));
    if (invalid.length) {
        console.error(`Invalid --only category: ${invalid.join(', ')}. Valid: ${DRIFT_CATEGORIES.join(', ')}`);
        process.exit(1);
    }
    return cats;
}

function parseDecisionsPath(argv) {
    const arg = argv.find(a => a === '--decisions' || a.startsWith('--decisions='));
    if (!arg) return null;
    return arg.includes('=') ? arg.split('=')[1] : (argv[argv.indexOf(arg) + 1] || '');
}

async function parseDecisionsFile(filePath) {
    const rows = await readSheetObjects(fs.readFileSync(filePath), { sheetName: 'Review' });
    const map = new Map();
    for (const r of rows) {
        const key = String(r['group_key'] || '').trim();
        if (!key) continue;
        map.set(key, {
            decision: String(r['Owner decision'] || '').trim().toLowerCase(),
            correctId: String(r['Correct ID'] || '').trim(),
        });
    }
    return map;
}

async function main(apply = process.argv.includes('--apply'), only = parseOnly(process.argv), decisionsPath = parseDecisionsPath(process.argv)) {
    const APPLY = apply;
    const ONLY = only; // null = all categories
    const decisions = decisionsPath ? await parseDecisionsFile(decisionsPath) : null;
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

    const liveBundle = buildLiveSandataMap(auths);
    const liveMap = liveBundle.sandataByClientService;
    const ownerMap = buildSandataOwnerMap(auths);

    const allChanges = [];
    for (const s of shifts) {
        const live = liveMap[`${s.clientId}|${s.serviceCode}`];
        // Only correct when a live authorization value exists AND differs.
        if (live == null) continue;
        const current = (s.sandataClientId || '').trim();
        if (current === live) continue;
        const category = classifyDrift({ clientId: s.clientId, storedValue: current }, ownerMap);
        allChanges.push({
            shiftId: s.id,
            clientId: s.clientId,
            clientName: s.client?.clientName || `#${s.clientId}`,
            serviceCode: s.serviceCode,
            shiftDate: s.shiftDate ? s.shiftDate.toISOString().split('T')[0] : '',
            oldValue: current || '(blank)',
            newValue: live,
            category,
        });
    }

    // Category breakdown across ALL drifted shifts (before any --only filter).
    const counts = {};
    for (const c of DRIFT_CATEGORIES) counts[c] = 0;
    for (const c of allChanges) counts[c.category]++;

    // The subset selected for correction this run.
    const decStats = { applied: 0, keptCurrent: 0, enteredCorrect: 0, skippedBlank: 0, skippedUnknown: 0, noDecision: 0 };

    let selected;
    if (decisions) {
        selected = [];
        for (const c of allChanges) {
            if (ONLY && !ONLY.includes(c.category)) continue;
            const key = `${c.clientId}|${c.serviceCode}|${c.oldValue}|${c.newValue}`;
            const d = decisions.get(key);
            if (!d || d.decision === '') { decStats.noDecision++; continue; }
            if (d.decision === 'keep current') { decStats.keptCurrent++; continue; }
            if (d.decision === 'use proposed') {
                selected.push({ ...c, applyValue: c.newValue });
                decStats.applied++;
            } else if (d.decision === 'enter correct id') {
                if (!d.correctId) { decStats.skippedBlank++; console.warn(`Skip ${key}: "Enter correct ID" with blank Correct ID`); continue; }
                selected.push({ ...c, applyValue: d.correctId });
                decStats.enteredCorrect++;
            } else {
                decStats.skippedUnknown++;
                console.warn(`Skip ${key}: unrecognized decision "${d.decision}"`);
            }
        }
    } else {
        selected = (ONLY ? allChanges.filter(c => ONLY.includes(c.category)) : allChanges)
            .map(c => ({ ...c, applyValue: c.newValue }));
    }

    console.log(`\nShift Sandata ID cleanup — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Shifts scanned: ${shifts.length}, authorizations loaded: ${auths.length}`);
    console.log(`Total drifted shifts: ${allChanges.length}`);
    for (const c of DRIFT_CATEGORIES) console.log(`    ${c.padEnd(14)} ${counts[c]}`);
    console.log(ONLY ? `Filter --only=${ONLY.join(',')} -> selected for correction: ${selected.length}` : `No filter -> all ${selected.length} selected for correction`);
    if (decisions) console.log(decStats);
    console.log('');

    if (allChanges.length) {
        // Always write a FULL CSV report (every category) so nothing is hidden,
        // with a `selected` flag showing what this run's filter would touch.
        const outDir = path.join(__dirname, '..', 'tmp');
        fs.mkdirSync(outDir, { recursive: true });
        const csvPath = path.join(outDir, 'shift-sandata-id-cleanup-report.csv');
        const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const selectedIds = new Set(selected.map(c => c.shiftId));
        const csv = ['shiftId,clientName,serviceCode,shiftDate,oldValue,newValue,category,selected']
            .concat(allChanges.map(c => [
                c.shiftId, c.clientName, c.serviceCode, c.shiftDate, c.oldValue, c.newValue, c.category,
                selectedIds.has(c.shiftId) ? 'yes' : 'no',
            ].map(esc).join(',')))
            .join('\n');
        fs.writeFileSync(csvPath, csv + '\n');
        console.log(`Full report (all categories, with a 'selected' column) written to ${csvPath}`);
    }

    if (!APPLY) {
        console.log('\nDry run — no changes written. Re-run with --apply to persist the selected subset.');
        return { scanned: shifts.length, corrected: 0, pending: selected.length, counts, decisions: decisions ? decStats : undefined };
    }

    let updated = 0;
    for (const c of selected) {
        await prisma.shift.update({
            where: { id: c.shiftId },
            data: { sandataClientId: c.applyValue },
        });
        updated++;
    }
    console.log(`\nApplied. Shifts updated: ${updated}`);
    return { scanned: shifts.length, corrected: updated, counts, decisions: decisions ? decStats : undefined };
}

module.exports = { main, parseDecisionsFile };

// Auto-run only when invoked directly (not when required by tests).
if (require.main === module) {
    main()
        .catch((e) => { console.error(e); process.exit(1); })
        .finally(() => prisma.$disconnect());
}
