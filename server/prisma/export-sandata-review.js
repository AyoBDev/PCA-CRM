/**
 * Generate the owner Sandata-ID review sheet (one row per drifted decision group).
 * READ-ONLY: never writes to the DB. See
 * docs/superpowers/specs/2026-08-07-sandata-id-owner-review-design.md
 *
 * Run: cd server && node prisma/export-sandata-review.js
 */
const fs = require('fs');
const path = require('path');
const { writeXlsxFile } = require('../src/lib/xlsxHelper');
const prisma = require('../src/lib/prisma');
const {
    buildLiveSandataMap, buildSandataOwnerMap, classifyDrift, groupDrift,
} = require('../src/lib/sandataResolver');

const DECISIONS = ['Keep current', 'Use proposed', 'Enter correct ID'];
const HEADER = ['Client', 'Service', 'Current ID', 'Proposed ID', '# shifts',
    'Date range', 'Category', 'Owner decision', 'Correct ID', 'Notes', 'group_key'];

function defaultDecision(category) {
    return (category === 'cross_client' || category === 'blank_fill_in') ? 'Use proposed' : '';
}

function buildAoa(groups) {
    const rows = groups.map(g => [
        g.clientName,
        g.serviceCode,
        g.oldValue,
        g.newValue,
        g.shiftCount,
        g.firstDate && g.lastDate ? `${g.firstDate} – ${g.lastDate}` : (g.firstDate || g.lastDate || ''),
        g.category,
        defaultDecision(g.category),
        '',   // Correct ID
        '',   // Notes
        g.groupKey,
    ]);
    return [HEADER, ...rows];
}

async function collectGroups() {
    const shifts = await prisma.shift.findMany({
        where: { archivedAt: null },
        select: { id: true, clientId: true, serviceCode: true, sandataClientId: true, shiftDate: true,
            client: { select: { clientName: true } } },
        orderBy: [{ clientId: 'asc' }, { shiftDate: 'asc' }],
    });
    const clientIds = [...new Set(shifts.map(s => s.clientId).filter(Boolean))];
    const auths = clientIds.length ? await prisma.authorization.findMany({
        where: { clientId: { in: clientIds }, archivedAt: null },
        select: { clientId: true, serviceCode: true, sandataClientId: true, manualStatus: true },
    }) : [];
    const liveMap = buildLiveSandataMap(auths);
    const ownerMap = buildSandataOwnerMap(auths);
    const changes = [];
    for (const s of shifts) {
        const live = liveMap[`${s.clientId}|${s.serviceCode}`];
        if (live == null) continue;
        const current = (s.sandataClientId || '').trim();
        if (current === live) continue;
        changes.push({
            shiftId: s.id, clientId: s.clientId,
            clientName: s.client?.clientName || `#${s.clientId}`,
            serviceCode: s.serviceCode,
            shiftDate: s.shiftDate ? s.shiftDate.toISOString().split('T')[0] : '',
            oldValue: current || '(blank)', newValue: live,
            category: classifyDrift({ clientId: s.clientId, storedValue: current }, ownerMap),
        });
    }
    return groupDrift(changes);
}

async function main() {
    const groups = await collectGroups();
    const outDir = path.join(__dirname, '..', 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'sandata-owner-review.xlsx');

    await writeXlsxFile(outPath, [
        { name: 'Review', rows: buildAoa(groups) },
        {
            name: 'Choices',
            rows: [
                ['Owner decision — put ONE of these in the "Owner decision" column:'],
                ['Keep current', 'leave the shifts as they are'],
                ['Use proposed', 'change the shifts to the Proposed ID'],
                ['Enter correct ID', 'neither is right — type the correct value in "Correct ID"'],
            ],
        },
    ]);
    console.log(`Wrote ${groups.length} decision rows to ${outPath}`);
    return { groups: groups.length, path: outPath };
}

module.exports = { main, buildAoa, collectGroups, DECISIONS, HEADER };

if (require.main === module) {
    main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
