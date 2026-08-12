# Owner Sandata-ID Review Sheet + Apply-from-Decisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agency owner a plain spreadsheet to decide each drifted Sandata-ID case, then apply exactly their decisions to the shifts.

**Architecture:** Two Node scripts beside the existing `fix-shift-sandata-ids.js`, sharing drift logic from `server/src/lib/sandataResolver.js`. A new pure helper collapses drifted shifts into one decision row per `clientId|serviceCode|oldValue|newValue` group. A generator writes an `.xlsx` review sheet from those groups; an extended cleanup mode reads the filled-in sheet back and applies each decision. All DB writes stay dry-run by default.

**Tech Stack:** Node.js, Prisma (via `server/src/lib/prisma`), `xlsx` (SheetJS Community, already a dependency), Jest.

## Global Constraints

- **`xlsx@0.18.5` cannot write Excel data-validation dropdowns** (Pro-only). The decision cell is a plain text cell; valid values are enforced on the apply side, not by the sheet. Do NOT attempt `dataValidation` via `xlsx`.
- **Dry-run by default.** Any DB mutation happens only when `--apply` is passed. The generator never writes to the DB.
- **Never blank a shift.** A decision resolving to an empty value must skip that group with a warning, never write `''`.
- **Match rows by stable group key**, never by row position (the owner may re-sort). Group key format: `` `${clientId}|${serviceCode}|${oldValue}|${newValue}` `` where `oldValue` uses the literal `(blank)` when the stored value is empty (matching the existing report convention).
- **Reuse existing shared logic** from `server/src/lib/sandataResolver.js`: `buildLiveSandataMap`, `buildSandataOwnerMap`, `classifyDrift`, `DRIFT_CATEGORIES`. Do not duplicate drift/classification logic.
- **Decision vocabulary (exact strings):** `Keep current`, `Use proposed`, `Enter correct ID`. Comparison is case-insensitive and trimmed; anything else = undecided (skip + warn).
- **Tests** use the mocked-prisma + mocked-fs pattern already in `server/__tests__/fixShiftSandataIds.test.js`. Run from `server/` with `npx jest <name>`.
- **No AI attribution** in commits.

---

### Task 1: Grouping helper — collapse drifted shifts into decision rows

**Files:**
- Modify: `server/src/lib/sandataResolver.js` (add `groupDrift`, export it)
- Test: `server/__tests__/sandataResolver.test.js` (add a `describe('groupDrift')` block)

**Interfaces:**
- Consumes: nothing new (pure function over an array).
- Produces: `groupDrift(changes)` where each input change is
  `{ shiftId:number, clientId:number, clientName:string, serviceCode:string, shiftDate:string, oldValue:string, newValue:string, category:string }`
  (the exact shape `fix-shift-sandata-ids.js` already builds in its `allChanges` array).
  Returns an array of group objects, one per `clientId|serviceCode|oldValue|newValue`:
  ```
  {
    groupKey:   string,   // `${clientId}|${serviceCode}|${oldValue}|${newValue}`
    clientId:   number,
    clientName: string,
    serviceCode:string,
    oldValue:   string,   // '(blank)' when empty
    newValue:   string,
    category:   string,   // category of the group (all shifts in a group share it)
    shiftCount: number,
    firstDate:  string,   // min shiftDate in group ('' if none)
    lastDate:   string,   // max shiftDate in group
    shiftIds:   number[], // every shift id in the group
  }
  ```
  Sorted by `clientName` then `serviceCode`.

- [ ] **Step 1: Write the failing test**

Add to `server/__tests__/sandataResolver.test.js`:

```js
const { groupDrift } = require('../src/lib/sandataResolver');

describe('groupDrift', () => {
  const mk = (shiftId, shiftDate, extra = {}) => ({
    shiftId, clientId: 42, clientName: 'Heidi', serviceCode: 'PCS',
    shiftDate, oldValue: 'JAVIER', newValue: 'HEIDI', category: 'cross_client', ...extra,
  });

  test('collapses shifts sharing client+code+old+new into one row', () => {
    const groups = groupDrift([
      mk(1, '2026-08-03'), mk(2, '2026-08-10'), mk(3, '2026-08-17'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupKey).toBe('42|PCS|JAVIER|HEIDI');
    expect(groups[0].shiftCount).toBe(3);
    expect(groups[0].firstDate).toBe('2026-08-03');
    expect(groups[0].lastDate).toBe('2026-08-17');
    expect(groups[0].shiftIds).toEqual([1, 2, 3]);
    expect(groups[0].category).toBe('cross_client');
  });

  test('keeps different old->new pairs as separate groups and sorts by client then code', () => {
    const groups = groupDrift([
      { shiftId: 9, clientId: 99, clientName: 'Zed', serviceCode: 'PCS', shiftDate: '2026-08-01', oldValue: '(blank)', newValue: 'Z1', category: 'blank_fill_in' },
      mk(1, '2026-08-03'),
      { shiftId: 5, clientId: 42, clientName: 'Heidi', serviceCode: 'S5130', shiftDate: '2026-08-02', oldValue: 'X', newValue: 'Y', category: 'value_review' },
    ]);
    expect(groups.map(g => g.groupKey)).toEqual([
      '42|PCS|JAVIER|HEIDI', '42|S5130|X|Y', '99|PCS|(blank)|Z1',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest sandataResolver -t groupDrift`
Expected: FAIL — `groupDrift is not a function`.

- [ ] **Step 3: Implement `groupDrift` and export it**

In `server/src/lib/sandataResolver.js`, add before `module.exports`:

```js
/**
 * Collapse per-shift drift records into one decision row per
 * clientId|serviceCode|oldValue|newValue group. See the owner-review plan.
 */
function groupDrift(changes) {
    const byKey = new Map();
    for (const c of changes || []) {
        const key = `${c.clientId}|${c.serviceCode}|${c.oldValue}|${c.newValue}`;
        let g = byKey.get(key);
        if (!g) {
            g = {
                groupKey: key,
                clientId: c.clientId,
                clientName: c.clientName,
                serviceCode: c.serviceCode,
                oldValue: c.oldValue,
                newValue: c.newValue,
                category: c.category,
                shiftCount: 0,
                firstDate: '',
                lastDate: '',
                shiftIds: [],
            };
            byKey.set(key, g);
        }
        g.shiftCount++;
        g.shiftIds.push(c.shiftId);
        const d = c.shiftDate || '';
        if (d) {
            if (!g.firstDate || d < g.firstDate) g.firstDate = d;
            if (!g.lastDate || d > g.lastDate) g.lastDate = d;
        }
    }
    return [...byKey.values()].sort((a, b) =>
        a.clientName.localeCompare(b.clientName) || a.serviceCode.localeCompare(b.serviceCode));
}
```

Then add `groupDrift,` to the `module.exports` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest sandataResolver -t groupDrift`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sandataResolver.js server/__tests__/sandataResolver.test.js
git commit -m "feat(scheduling): groupDrift helper collapses drift into decision rows"
```

---

### Task 2: Review-sheet generator script

**Files:**
- Create: `server/prisma/export-sandata-review.js`
- Test: `server/__tests__/exportSandataReview.test.js`
- Modify: `server/package.json` (add `db:export-sandata-review` script)

**Interfaces:**
- Consumes: `groupDrift` (Task 1); `buildLiveSandataMap`, `buildSandataOwnerMap`, `classifyDrift` (existing).
- Produces: `main()` returns `{ groups:number, path:string }`. Writes an `.xlsx` at
  `server/tmp/sandata-owner-review.xlsx` with sheets `Review` and `Choices`.
  Exposes `buildAoa(groups)` returning a 2-D array (header + legend + rows) for testing.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/exportSandataReview.test.js`:

```js
jest.mock('../src/lib/prisma', () => ({
  shift: { findMany: jest.fn() },
  authorization: { findMany: jest.fn() },
  $disconnect: jest.fn(),
}));
jest.mock('fs', () => ({ mkdirSync: jest.fn(), writeFileSync: jest.fn() }));
jest.mock('xlsx', () => ({
  utils: { aoa_to_sheet: jest.fn(() => ({})), book_new: jest.fn(() => ({})), book_append_sheet: jest.fn() },
  writeFile: jest.fn(),
}));

const { buildAoa } = require('../prisma/export-sandata-review');

test('buildAoa emits a header row and one row per group with default decisions', () => {
  const groups = [
    { groupKey: '42|PCS|JAVIER|HEIDI', clientName: 'Heidi', serviceCode: 'PCS',
      oldValue: 'JAVIER', newValue: 'HEIDI', category: 'cross_client',
      shiftCount: 25, firstDate: '2026-08-03', lastDate: '2026-12-25' },
    { groupKey: '99|PCS|(blank)|Z1', clientName: 'Zed', serviceCode: 'PCS',
      oldValue: '(blank)', newValue: 'Z1', category: 'blank_fill_in',
      shiftCount: 5, firstDate: '2026-08-01', lastDate: '2026-09-01' },
    { groupKey: '7|S5130|X|Y', clientName: 'Amy', serviceCode: 'S5130',
      oldValue: 'X', newValue: 'Y', category: 'value_review',
      shiftCount: 3, firstDate: '2026-08-02', lastDate: '2026-08-16' },
  ];
  const aoa = buildAoa(groups);
  const header = aoa[0];
  expect(header).toEqual([
    'Client', 'Service', 'Current ID', 'Proposed ID', '# shifts', 'Date range',
    'Category', 'Owner decision', 'Correct ID', 'Notes', 'group_key',
  ]);
  const rows = aoa.slice(1);
  const heidi = rows.find(r => r[10] === '42|PCS|JAVIER|HEIDI');
  expect(heidi[7]).toBe('Use proposed');      // cross_client default
  const zed = rows.find(r => r[10] === '99|PCS|(blank)|Z1');
  expect(zed[7]).toBe('Use proposed');         // blank_fill_in default
  const amy = rows.find(r => r[10] === '7|S5130|X|Y');
  expect(amy[7]).toBe('');                      // value_review -> forced choice
  expect(amy[5]).toBe('2026-08-02 – 2026-08-16'); // date range formatting
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest exportSandataReview`
Expected: FAIL — cannot find module `../prisma/export-sandata-review`.

- [ ] **Step 3: Implement the generator**

Create `server/prisma/export-sandata-review.js`:

```js
/**
 * Generate the owner Sandata-ID review sheet (one row per drifted decision group).
 * READ-ONLY: never writes to the DB. See
 * docs/superpowers/specs/2026-08-07-sandata-id-owner-review-design.md
 *
 * Run: cd server && node prisma/export-sandata-review.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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

    const wb = XLSX.utils.book_new();
    const reviewWs = XLSX.utils.aoa_to_sheet(buildAoa(groups));
    XLSX.utils.book_append_sheet(wb, reviewWs, 'Review');

    const choicesWs = XLSX.utils.aoa_to_sheet([
        ['Owner decision — put ONE of these in the "Owner decision" column:'],
        ['Keep current', 'leave the shifts as they are'],
        ['Use proposed', 'change the shifts to the Proposed ID'],
        ['Enter correct ID', 'neither is right — type the correct value in "Correct ID"'],
    ]);
    XLSX.utils.book_append_sheet(wb, choicesWs, 'Choices');

    XLSX.writeFile(wb, outPath);
    console.log(`Wrote ${groups.length} decision rows to ${outPath}`);
    return { groups: groups.length, path: outPath };
}

module.exports = { main, buildAoa, collectGroups, DECISIONS, HEADER };

if (require.main === module) {
    main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest exportSandataReview`
Expected: PASS.

- [ ] **Step 5: Add the npm script**

In `server/package.json`, after the `"db:fix-shift-sandata-ids"` line, add:

```json
    "db:export-sandata-review": "node prisma/export-sandata-review.js",
```

(Ensure the preceding line keeps its trailing comma and JSON stays valid.)

- [ ] **Step 6: Commit**

```bash
git add server/prisma/export-sandata-review.js server/__tests__/exportSandataReview.test.js server/package.json
git commit -m "feat(scheduling): generate owner Sandata-ID review sheet"
```

---

### Task 3: Apply-from-decisions mode in the cleanup script

**Files:**
- Modify: `server/prisma/fix-shift-sandata-ids.js`
- Test: `server/__tests__/fixShiftSandataIds.test.js` (add a `describe('--decisions')` block)

**Interfaces:**
- Consumes: the review `.xlsx`/`.csv` produced by Task 2 (matched by `group_key`).
- Produces: `main(apply, only, decisionsPath)` — third parameter is a path string or
  `null`. When set, only groups with a recognized decision are acted on:
  `Use proposed` → write live value; `Enter correct ID` → write the row's `Correct ID`
  (skip+warn if blank); `Keep current`/unknown/absent → skip. Returns
  `{ scanned, corrected|pending, counts, decisions? }` where `decisions` summarizes
  `{ applied, keptCurrent, enteredCorrect, skippedBlank, skippedUnknown }`.
- Exposes `parseDecisionsFile(path)` returning `Map<groupKey, {decision, correctId}>`
  (decision lower-cased+trimmed; correctId trimmed).

- [ ] **Step 1: Write the failing test**

Add to `server/__tests__/fixShiftSandataIds.test.js` (top-level, after existing imports):

```js
const XLSX = require('xlsx');
const os = require('os');
const realFs = jest.requireActual('fs');
const nodePath = require('path');

function writeDecisionsXlsx(rows) {
  // rows: [{group_key, decision, correctId}]
  const header = ['Client','Service','Current ID','Proposed ID','# shifts','Date range',
    'Category','Owner decision','Correct ID','Notes','group_key'];
  const aoa = [header, ...rows.map(r => ['', '', '', '', '', '', '', r.decision, r.correctId || '', '', r.group_key])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Review');
  const p = nodePath.join(os.tmpdir(), `decisions-${Date.now()}-${Math.random()}.xlsx`);
  XLSX.writeFile(wb, p);
  return p;
}
```

Then add this block (note: this block needs real `fs` for `XLSX.writeFile`, so it must
NOT be under the `jest.mock('fs', ...)`; see Step 3's note — the existing suite mocks
`fs`, so put the decisions describe in a **new** file instead):

Create `server/__tests__/fixShiftSandataIdsDecisions.test.js`:

```js
const XLSX = require('xlsx');
const os = require('os');
const nodePath = require('path');

jest.mock('../src/lib/prisma', () => ({
  shift: { findMany: jest.fn(), update: jest.fn() },
  authorization: { findMany: jest.fn() },
  $disconnect: jest.fn(),
}));
// NOTE: fs is NOT mocked here — the cleanup writes a CSV report and we write real xlsx fixtures.

const prisma = require('../src/lib/prisma');
const { main, parseDecisionsFile } = require('../prisma/fix-shift-sandata-ids');

const shift = (id, clientId, serviceCode, sandataClientId) => ({
  id, clientId, serviceCode, sandataClientId,
  shiftDate: new Date('2026-08-10T00:00:00.000Z'),
  client: { clientName: `Client ${clientId}` },
});

function writeDecisions(rows) {
  const header = ['Client','Service','Current ID','Proposed ID','# shifts','Date range',
    'Category','Owner decision','Correct ID','Notes','group_key'];
  const aoa = [header, ...rows.map(r => ['','','','','','','', r.decision, r.correctId||'', '', r.group_key])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Review');
  const p = nodePath.join(os.tmpdir(), `dec-${Date.now()}-${Math.random()}.xlsx`);
  XLSX.writeFile(wb, p);
  return p;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  prisma.shift.update.mockResolvedValue({});
});
afterEach(() => { console.log.mockRestore(); console.warn.mockRestore(); });

test('parseDecisionsFile keys by group_key with normalized decision', () => {
  const p = writeDecisions([{ group_key: '42|PCS|JAVIER|HEIDI', decision: 'Use Proposed' }]);
  const m = parseDecisionsFile(p);
  expect(m.get('42|PCS|JAVIER|HEIDI')).toEqual({ decision: 'use proposed', correctId: '' });
});

test('applies Use proposed and Enter correct ID; skips Keep current and unknown', async () => {
  prisma.shift.findMany.mockResolvedValue([
    shift(1, 42, 'PCS', 'JAVIER'),   // group 42|PCS|JAVIER|HEIDI -> Use proposed
    shift(2, 7, 'S5130', 'X'),       // group 7|S5130|X|Y        -> Enter correct ID = Z
    shift(3, 9, 'PCS', 'OLD'),       // group 9|PCS|OLD|NEW       -> Keep current
    shift(4, 5, 'PCS', 'HUH'),       // group 5|PCS|HUH|NEW2      -> unknown decision
  ]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI', manualStatus: 'active' },
    { clientId: 7, serviceCode: 'S5130', sandataClientId: 'Y', manualStatus: 'active' },
    { clientId: 9, serviceCode: 'PCS', sandataClientId: 'NEW', manualStatus: 'active' },
    { clientId: 5, serviceCode: 'PCS', sandataClientId: 'NEW2', manualStatus: 'active' },
  ]);
  const p = writeDecisions([
    { group_key: '42|PCS|JAVIER|HEIDI', decision: 'Use proposed' },
    { group_key: '7|S5130|X|Y', decision: 'Enter correct ID', correctId: 'Z' },
    { group_key: '9|PCS|OLD|NEW', decision: 'Keep current' },
    { group_key: '5|PCS|HUH|NEW2', decision: 'nonsense' },
  ]);

  const summary = await main(true, null, p);

  expect(summary.corrected).toBe(2);
  const calls = prisma.shift.update.mock.calls.map(c => c[0]);
  expect(calls).toContainEqual({ where: { id: 1 }, data: { sandataClientId: 'HEIDI' } });
  expect(calls).toContainEqual({ where: { id: 2 }, data: { sandataClientId: 'Z' } });
  expect(prisma.shift.update).toHaveBeenCalledTimes(2);
});

test('Enter correct ID with blank Correct ID skips and never blanks the shift', async () => {
  prisma.shift.findMany.mockResolvedValue([shift(1, 42, 'PCS', 'JAVIER')]);
  prisma.authorization.findMany.mockResolvedValue([
    { clientId: 42, serviceCode: 'PCS', sandataClientId: 'HEIDI', manualStatus: 'active' },
  ]);
  const p = writeDecisions([{ group_key: '42|PCS|JAVIER|HEIDI', decision: 'Enter correct ID', correctId: '' }]);
  const summary = await main(true, null, p);
  expect(summary.corrected).toBe(0);
  expect(prisma.shift.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest fixShiftSandataIdsDecisions`
Expected: FAIL — `parseDecisionsFile is not a function` / `main` ignores 3rd arg.

- [ ] **Step 3: Implement `--decisions` mode**

In `server/prisma/fix-shift-sandata-ids.js`:

3a. Add `XLSX` require near the top (after the `path` require):

```js
const XLSX = require('xlsx');
```

3b. Add a decisions parser and CLI flag parser. After the existing `parseOnly` function, add:

```js
function parseDecisionsPath(argv) {
    const arg = argv.find(a => a === '--decisions' || a.startsWith('--decisions='));
    if (!arg) return null;
    return arg.includes('=') ? arg.split('=')[1] : (argv[argv.indexOf(arg) + 1] || '');
}

function parseDecisionsFile(filePath) {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['Review'] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
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
```

3c. Change the `main` signature to accept the decisions path:

```js
async function main(apply = process.argv.includes('--apply'), only = parseOnly(process.argv), decisionsPath = parseDecisionsPath(process.argv)) {
    const APPLY = apply;
    const ONLY = only; // null = all categories
    const decisions = decisionsPath ? parseDecisionsFile(decisionsPath) : null;
```

3d. Replace the block that computes `selected` (currently the single line
`const selected = ONLY ? allChanges.filter(c => ONLY.includes(c.category)) : allChanges;`)
with decision-aware selection. Each change carries `oldValue`/`newValue`/`clientId`/`serviceCode`,
so recompute its group key and consult the decisions map:

```js
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
```

3e. The apply loop must now write `applyValue` (not `newValue`). Change the loop body:

```js
    let updated = 0;
    for (const c of selected) {
        await prisma.shift.update({
            where: { id: c.shiftId },
            data: { sandataClientId: c.applyValue },
        });
        updated++;
    }
```

3f. Include `decisions` summary in the return values. In the dry-run return add `decisions: decisions ? decStats : undefined`, and in the apply return add `decisions: decisions ? decStats : undefined`. Also print `decStats` when `decisions` is set (a single `console.log(decStats)` before the dry-run/apply branch is enough).

3g. Export `parseDecisionsFile`:

```js
module.exports = { main, parseDecisionsFile };
```

3h. Update the header docstring `Run:` examples to include:

```
 *   node prisma/fix-shift-sandata-ids.js --decisions=tmp/sandata-owner-review.xlsx          # dry run
 *   node prisma/fix-shift-sandata-ids.js --decisions=tmp/sandata-owner-review.xlsx --apply  # persist owner decisions
```

- [ ] **Step 4: Run the decisions test + the existing cleanup test to verify both pass**

Run: `cd server && npx jest fixShiftSandataIds`
Expected: PASS for both `fixShiftSandataIds.test.js` (unchanged behavior — `main(apply, only)` still works because `decisionsPath` defaults to reading argv, which has no `--decisions` in tests) and `fixShiftSandataIdsDecisions.test.js`.

Note: the existing tests call `main(false, null)` / `main(true, null)` (two args). With three
params, the third defaults to `parseDecisionsPath(process.argv)`. Under Jest, `process.argv`
has no `--decisions`, so it resolves to `null` — behavior is unchanged. Verify this holds; if
Jest's argv ever contains `--decisions`, pass an explicit `null` third arg in those tests.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/fix-shift-sandata-ids.js server/__tests__/fixShiftSandataIdsDecisions.test.js
git commit -m "feat(scheduling): apply Sandata-ID cleanup from owner decision sheet"
```

---

### Task 4: End-to-end verification against the production copy

**Files:** none (verification only; may update `DECISIONS.md` and the PR).

**Interfaces:** none.

- [ ] **Step 1: Full server test suite**

Run: `cd server && npx jest`
Expected: all green except the pre-existing `enforceAuthLimit` live-DB test (fails identically on `main`). Confirm the three new/modified suites pass: `sandataResolver`, `exportSandataReview`, `fixShiftSandataIdsDecisions`, `fixShiftSandataIds`, `getScheduleView`.

- [ ] **Step 2: Generate the sheet against the prod copy**

The local v18 prod copy runs on port 5433 (`nvbestpca_prodcopy`). Run:

```bash
cd server
export LC_ALL=C
export DATABASE_URL="postgresql://mac@localhost:5433/nvbestpca_prodcopy"
export $(grep -E "^(ENCRYPTION_KEY|INTEGRITY_KEY)=" .env | sed 's/"//g' | xargs)
node prisma/export-sandata-review.js
```

Expected: `Wrote ~54 decision rows to .../server/tmp/sandata-owner-review.xlsx`.

- [ ] **Step 3: Sanity-check the sheet**

Open/parse `server/tmp/sandata-owner-review.xlsx` and confirm: header row matches
`HEADER`; `cross_client`/`blank_fill_in` rows default to `Use proposed`; `value_review`
rows have a blank decision; Heydi Martinez-Reyes PCS row is present with
`Current ID` 496541 → `Proposed ID` 886074.

- [ ] **Step 4: Round-trip a decisions dry-run**

Simulate the owner accepting defaults (leave file as generated), then:

```bash
cd server
export LC_ALL=C
export DATABASE_URL="postgresql://mac@localhost:5433/nvbestpca_prodcopy"
export $(grep -E "^(ENCRYPTION_KEY|INTEGRITY_KEY)=" .env | sed 's/"//g' | xargs)
node prisma/fix-shift-sandata-ids.js --decisions=tmp/sandata-owner-review.xlsx
```

Expected: dry-run summary shows the `Use proposed` groups counted under `applied`, the
blank `value_review` groups under `noDecision`, no DB writes. Do NOT run `--apply`.

- [ ] **Step 5: Commit any doc updates**

```bash
git add DECISIONS.md
git commit -m "docs(scheduling): record owner-review sheet round-trip verification"
```

(Only if `DECISIONS.md` was updated; otherwise skip.)

---

## Notes for the executor

- Work stays in the worktree `worktrees/fix-schedule-pdf-sandata-id` on branch
  `fix/schedule-pdf-live-sandata-id` (PR #50). The prod copy + v18 server are already
  running from earlier; if the server is down, it can be re-initialized per the session's
  earlier setup (initdb with `LC_ALL=C`, port 5433).
- The worktree's `server/node_modules` is a symlink to the main checkout's; keep it.
- `docs/` is gitignored in this repo — use `git add -f` for files under `docs/`.
