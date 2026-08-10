# Sandata ID + Account Number Live Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Authorization` the single source of truth for both a shift's Sandata Client ID and account number by resolving both live from the authorization on every read, and no longer persisting or trusting the stored copies on `Shift`.

**Architecture:** Pure resolver helpers in `server/src/lib/sandataResolver.js` build lookup maps from a client's authorizations and derive `accountNumber` first (by `clientId|serviceCode`), then the Sandata ID off that derived account (by `clientId|accountNumber`), each with name/serviceCode fallbacks and a blank terminal case. Schedule read endpoints build the maps once per request and pass them into `enrichShift`. Write paths stop persisting `accountNumber`/`sandataClientId` from request bodies; both auth→shift propagation blocks are removed. The DB columns stay (dormant) — no migration.

**Tech Stack:** Node.js, Express, Prisma (PostgreSQL), Jest (backend), React 19 (frontend), existing app design system.

## Global Constraints

- No Prisma migration; `Shift.sandata_client_id` and `Shift.account_number` columns remain but go dormant (never read for display, written as `''`).
- Backend logic is built test-first (TDD). Frontend uses the existing app design system (no new tokens).
- `normalizeName` MUST reuse the exported function from `server/src/services/payrollService.js` (lowercase, strip non-alphanumeric, sort tokens) — do not reimplement.
- Resolution keys proven unambiguous on production data: `(clientId, serviceCode)→accountNumber`, `(clientId, accountNumber)→sandataId`, `(name, serviceCode)→both`.
- Never fall back to a shift's stored `sandataClientId` or `accountNumber`. Terminal case is `''` (renders `—`).
- No AI attribution in commit messages.

---

### Task 1: Rewrite the resolver — account + Sandata map bundle and two resolve functions

**Files:**
- Modify: `server/src/lib/sandataResolver.js`
- Test: `server/__tests__/sandataResolver.test.js`

**Interfaces:**
- Consumes: `normalizeName` from `../services/payrollService`.
- Produces:
  - `buildLiveSandataMap(auths) -> { accountByClientService, accountByNameService, sandataByClientAccount, sandataByClientService, sandataByNameService }` (all plain objects; string→string).
  - `resolveShiftAccountNumber(shift, maps) -> string` where `shift` has `{ clientId, serviceCode, client?: { clientName } , clientName? }`.
  - `resolveShiftSandataId(shift, derivedAccount, maps) -> string`.
  - Existing `buildSandataOwnerMap`, `classifyDrift`, `groupDrift`, `DRIFT_CATEGORIES` remain exported and unchanged.

- [ ] **Step 1: Replace the resolver tests for the new signatures**

Replace the `buildLiveSandataMap` and `resolveShiftSandataId` describe blocks in `server/__tests__/sandataResolver.test.js` with the following (leave the `classifyDrift` and `groupDrift` blocks unchanged):

```javascript
const {
  buildLiveSandataMap,
  resolveShiftAccountNumber,
  resolveShiftSandataId,
  buildSandataOwnerMap,
  classifyDrift,
  groupDrift,
} = require('../src/lib/sandataResolver');

describe('buildLiveSandataMap', () => {
  const auths = [
    { clientId: 42, serviceCode: 'PCS',   accountNumber: '71040', sandataClientId: '955054', manualStatus: 'active' },
    { clientId: 42, serviceCode: 'S5130', accountNumber: '71120', sandataClientId: '155788', manualStatus: 'active' },
  ];

  test('accountByClientService keys clientId|serviceCode -> accountNumber', () => {
    const m = buildLiveSandataMap(auths);
    expect(m.accountByClientService['42|PCS']).toBe('71040');
    expect(m.accountByClientService['42|S5130']).toBe('71120');
  });

  test('sandataByClientAccount keys clientId|accountNumber -> id', () => {
    const m = buildLiveSandataMap(auths);
    expect(m.sandataByClientAccount['42|71040']).toBe('955054');
    expect(m.sandataByClientAccount['42|71120']).toBe('155788');
  });

  test('sandataByClientService keys clientId|serviceCode -> id', () => {
    const m = buildLiveSandataMap(auths);
    expect(m.sandataByClientService['42|PCS']).toBe('955054');
  });

  test('name maps use normalizeName (sorted tokens) from payrollService', () => {
    const m = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', clientName: 'Smith, John', manualStatus: 'active' },
    ]);
    expect(m.accountByNameService['john smith|PCS']).toBe('71040');
    expect(m.sandataByNameService['john smith|PCS']).toBe('955054');
  });

  test('reads clientName from shift.client.clientName when present', () => {
    const m = buildLiveSandataMap([
      { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', client: { clientName: 'John Smith' }, manualStatus: 'active' },
    ]);
    expect(m.sandataByNameService['john smith|PCS']).toBe('955054');
  });

  test('trims values and ignores blank targets', () => {
    const m = buildLiveSandataMap([
      { clientId: 1, serviceCode: 'PCS', accountNumber: '  71040 ', sandataClientId: '  X ', manualStatus: 'active' },
      { clientId: 2, serviceCode: 'PCS', accountNumber: '', sandataClientId: '', manualStatus: 'active' },
    ]);
    expect(m.accountByClientService['1|PCS']).toBe('71040');
    expect(m.sandataByClientAccount['1|71040']).toBe('X');
    expect(m.accountByClientService['2|PCS']).toBeUndefined();
    expect(m.sandataByClientService['2|PCS']).toBeUndefined();
  });

  test('active auth wins over inactive for the same key (both dimensions)', () => {
    const m = buildLiveSandataMap([
      { clientId: 7, serviceCode: 'PCS', accountNumber: '111', sandataClientId: 'OLD', manualStatus: 'inactive' },
      { clientId: 7, serviceCode: 'PCS', accountNumber: '222', sandataClientId: 'NEW', manualStatus: 'active' },
    ]);
    expect(m.accountByClientService['7|PCS']).toBe('222');
    expect(m.sandataByClientService['7|PCS']).toBe('NEW');
  });

  test('treats null manualStatus as active', () => {
    const m = buildLiveSandataMap([
      { clientId: 7, serviceCode: 'PCS', accountNumber: '111', sandataClientId: 'X', manualStatus: null },
    ]);
    expect(m.accountByClientService['7|PCS']).toBe('111');
  });
});

describe('resolveShiftAccountNumber', () => {
  const maps = buildLiveSandataMap([
    { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', clientName: 'John Smith', manualStatus: 'active' },
  ]);

  test('resolves by clientId|serviceCode', () => {
    expect(resolveShiftAccountNumber({ clientId: 42, serviceCode: 'PCS' }, maps)).toBe('71040');
  });

  test('falls back to name|serviceCode when clientId does not match', () => {
    const shift = { clientId: 999, serviceCode: 'PCS', client: { clientName: 'Smith, John' } };
    expect(resolveShiftAccountNumber(shift, maps)).toBe('71040');
  });

  test('returns empty string when nothing matches (never the stored value)', () => {
    const shift = { clientId: 999, serviceCode: 'S5150', accountNumber: 'STORED', client: { clientName: 'Nobody' } };
    expect(resolveShiftAccountNumber(shift, maps)).toBe('');
  });
});

describe('resolveShiftSandataId', () => {
  const maps = buildLiveSandataMap([
    { clientId: 42, serviceCode: 'PCS',   accountNumber: '71040', sandataClientId: '955054', clientName: 'John Smith', manualStatus: 'active' },
    { clientId: 42, serviceCode: 'S5130', accountNumber: '71120', sandataClientId: '155788', clientName: 'John Smith', manualStatus: 'active' },
  ]);

  test('primary: clientId|derivedAccount wins', () => {
    const shift = { clientId: 42, serviceCode: 'PCS', sandataClientId: 'STALE' };
    expect(resolveShiftSandataId(shift, '71040', maps)).toBe('955054');
  });

  test('two accounts: derived account selects the matching Sandata id', () => {
    const shift = { clientId: 42, serviceCode: 'S5130' };
    expect(resolveShiftSandataId(shift, '71120', maps)).toBe('155788');
  });

  test('blank derived account skips primary, falls to clientId|serviceCode', () => {
    const shift = { clientId: 42, serviceCode: 'PCS' };
    expect(resolveShiftSandataId(shift, '', maps)).toBe('955054');
  });

  test('falls to name|serviceCode when clientId does not match', () => {
    const shift = { clientId: 999, serviceCode: 'PCS', client: { clientName: 'Smith, John' } };
    expect(resolveShiftSandataId(shift, '', maps)).toBe('955054');
  });

  test('returns empty string when nothing matches (never the stored value)', () => {
    const shift = { clientId: 999, serviceCode: 'S5150', sandataClientId: 'STORED', client: { clientName: 'Nobody' } };
    expect(resolveShiftSandataId(shift, '', maps)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest sandataResolver -t "buildLiveSandataMap" 2>&1 | head -30`
Expected: FAIL — `resolveShiftAccountNumber is not a function` / new map keys undefined.

- [ ] **Step 3: Rewrite the resolver implementation**

Replace the top of `server/src/lib/sandataResolver.js` (the file header comment may stay) — replace `buildLiveSandataMap` and `resolveShiftSandataId` with the following, and add `resolveShiftAccountNumber`. Keep `buildSandataOwnerMap`, `classifyDrift`, `groupDrift`, `DRIFT_CATEGORIES` exactly as they are.

```javascript
const { normalizeName } = require('../services/payrollService');

function clientNameOf(row) {
    return (row.client && row.client.clientName) || row.clientName || '';
}

// active-wins setter into a `{ value, active }` staging object
function setPreferActive(staging, key, value, isActive) {
    if (!key || !value) return;
    const existing = staging[key];
    if (!existing || (isActive && !existing.active)) {
        staging[key] = { value, active: isActive };
    }
}

function flatten(staging) {
    const out = {};
    for (const k of Object.keys(staging)) out[k] = staging[k].value;
    return out;
}

/**
 * Build the live lookup bundle from a client's authorizations. Both account
 * number and Sandata id are indexed; active auth wins over inactive per key.
 */
function buildLiveSandataMap(auths) {
    const accByCS = {}, accByNS = {};
    const sidByCA = {}, sidByCS = {}, sidByNS = {};
    for (const a of auths || []) {
        const isActive = (a.manualStatus || 'active') === 'active';
        const acct = (a.accountNumber || '').trim();
        const sid = (a.sandataClientId || '').trim();
        const nkey = normalizeName(clientNameOf(a));
        // account maps
        setPreferActive(accByCS, `${a.clientId}|${a.serviceCode}`, acct, isActive);
        setPreferActive(accByNS, `${nkey}|${a.serviceCode}`, acct, isActive);
        // sandata maps
        setPreferActive(sidByCA, `${a.clientId}|${acct}`, sid, isActive);
        setPreferActive(sidByCS, `${a.clientId}|${a.serviceCode}`, sid, isActive);
        setPreferActive(sidByNS, `${nkey}|${a.serviceCode}`, sid, isActive);
    }
    return {
        accountByClientService: flatten(accByCS),
        accountByNameService: flatten(accByNS),
        sandataByClientAccount: flatten(sidByCA),
        sandataByClientService: flatten(sidByCS),
        sandataByNameService: flatten(sidByNS),
    };
}

/** Derive the account number for a shift from the authorization (never the stored copy). */
function resolveShiftAccountNumber(shift, maps) {
    const cs = maps.accountByClientService[`${shift.clientId}|${shift.serviceCode}`];
    if (cs != null) return cs;
    const ns = maps.accountByNameService[`${normalizeName(clientNameOf(shift))}|${shift.serviceCode}`];
    if (ns != null) return ns;
    return '';
}

/** Derive the Sandata id, keyed primarily off the already-derived account number. */
function resolveShiftSandataId(shift, derivedAccount, maps) {
    if (derivedAccount) {
        const ca = maps.sandataByClientAccount[`${shift.clientId}|${derivedAccount}`];
        if (ca != null) return ca;
    }
    const cs = maps.sandataByClientService[`${shift.clientId}|${shift.serviceCode}`];
    if (cs != null) return cs;
    const ns = maps.sandataByNameService[`${normalizeName(clientNameOf(shift))}|${shift.serviceCode}`];
    if (ns != null) return ns;
    return '';
}
```

Update the `module.exports` block to export `buildLiveSandataMap, resolveShiftAccountNumber, resolveShiftSandataId, buildSandataOwnerMap, classifyDrift, groupDrift, DRIFT_CATEGORIES`.

- [ ] **Step 4: Run the resolver tests to verify they pass**

Run: `cd server && npx jest sandataResolver 2>&1 | tail -20`
Expected: PASS (all describe blocks, including the unchanged `classifyDrift`/`groupDrift`).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/sandataResolver.js server/__tests__/sandataResolver.test.js
git commit -m "feat(scheduling): resolver derives account then Sandata id from auth"
```

---

### Task 2: Add an `enrichShiftLive` path so responses carry resolved values

**Files:**
- Modify: `server/src/services/schedulingService.js:150-159` (the `enrichShift` function + exports)
- Test: `server/__tests__/enrichShiftLive.test.js` (create)

**Interfaces:**
- Consumes: `buildLiveSandataMap`, `resolveShiftAccountNumber`, `resolveShiftSandataId` from `../lib/sandataResolver` (Task 1).
- Produces: `enrichShiftLive(shift, maps) -> shift` — same shape as `enrichShift` plus `accountNumber`/`sandataClientId` overwritten with resolved values. `enrichShift(shift)` unchanged (backward compatible, still used where maps aren't available).

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/enrichShiftLive.test.js`:

```javascript
const { enrichShiftLive } = require('../src/services/schedulingService');
const { buildLiveSandataMap } = require('../src/lib/sandataResolver');

const maps = buildLiveSandataMap([
  { clientId: 42, serviceCode: 'PCS', accountNumber: '71040', sandataClientId: '955054', clientName: 'John Smith', manualStatus: 'active' },
]);

test('overwrites accountNumber and sandataClientId with resolved values', () => {
  const shift = { id: 1, clientId: 42, serviceCode: 'PCS', accountNumber: 'STALE', sandataClientId: 'STALE', client: { clientName: 'John Smith' } };
  const out = enrichShiftLive(shift, maps);
  expect(out.accountNumber).toBe('71040');
  expect(out.sandataClientId).toBe('955054');
  expect(out.serviceLabel).toBeDefined(); // still enriched like enrichShift
});

test('blanks both when the client has no matching authorization', () => {
  const shift = { id: 2, clientId: 999, serviceCode: 'S5150', accountNumber: 'STALE', sandataClientId: 'STALE', client: { clientName: 'Nobody' } };
  const out = enrichShiftLive(shift, maps);
  expect(out.accountNumber).toBe('');
  expect(out.sandataClientId).toBe('');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest enrichShiftLive 2>&1 | head -20`
Expected: FAIL — `enrichShiftLive is not a function`.

- [ ] **Step 3: Implement `enrichShiftLive` in `schedulingService.js`**

Add near `enrichShift` and to the imports/exports:

```javascript
const {
    buildLiveSandataMap,
    resolveShiftAccountNumber,
    resolveShiftSandataId,
} = require('../lib/sandataResolver');

function enrichShiftLive(shift, maps) {
    const base = enrichShift(shift);
    const accountNumber = resolveShiftAccountNumber(base, maps);
    const sandataClientId = resolveShiftSandataId(base, accountNumber, maps);
    return { ...base, accountNumber, sandataClientId };
}
```

Add `enrichShiftLive` and `buildLiveSandataMap` (re-export for controller convenience) to `module.exports`.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest enrichShiftLive 2>&1 | tail -15`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/schedulingService.js server/__tests__/enrichShiftLive.test.js
git commit -m "feat(scheduling): add enrichShiftLive to resolve account+Sandata on responses"
```

---

### Task 3: Use live resolution on the admin schedule list endpoint

**Files:**
- Modify: `server/src/controllers/schedulingController.js:280` (the `shifts.map(enrichShift)` in `getScheduleView`) and its auth fetch at `:107`.
- Test: `server/src/controllers/__tests__/schedulingBulkAndDelete.test.js` (add a case) OR a focused new test if the existing harness lacks a schedule-view path — see step 1.

**Interfaces:**
- Consumes: `enrichShiftLive`, `buildLiveSandataMap` from `schedulingService` (Task 2).
- Produces: `getScheduleView` response shifts carry resolved `accountNumber` + `sandataClientId`.

- [ ] **Step 1: Write a failing integration-style test**

Add to `server/src/controllers/__tests__/schedulingBulkAndDelete.test.js` a test that seeds a client with an authorization (`accountNumber: '71040'`, `sandataClientId: '955054'`), creates a shift for that client/serviceCode with a deliberately wrong stored `accountNumber`/`sandataClientId`, calls the schedule-view endpoint, and asserts the returned shift has `accountNumber === '71040'` and `sandataClientId === '955054'`. Follow the existing seeding/login patterns already in this test file.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest schedulingBulkAndDelete -t "live" 2>&1 | tail -25`
Expected: FAIL — returned values equal the stale stored copies, not the auth values.

- [ ] **Step 3: Wire live resolution into `getScheduleView`**

At line ~280, replace:

```javascript
const enriched = shifts.map(enrichShift);
```

with (reuse the `allAuths` already fetched at line ~107; if it is scoped elsewhere, fetch `prisma.authorization.findMany({ where: { clientId: { in: clientIds }, archivedAt: null } })` for the view's client ids):

```javascript
const liveMaps = buildLiveSandataMap(allAuths);
const enriched = shifts.map(s => enrichShiftLive(s, liveMaps));
```

Add `enrichShiftLive, buildLiveSandataMap` to the destructured import from `schedulingService` at the top of the controller.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest schedulingBulkAndDelete 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/schedulingController.js server/src/controllers/__tests__/schedulingBulkAndDelete.test.js
git commit -m "feat(scheduling): schedule view resolves account+Sandata live from auth"
```

---

### Task 4: Update the shared/public schedule view to the new resolver bundle

**Files:**
- Modify: `server/src/controllers/employeeScheduleLinkController.js:3,106-114`
- Test: existing `server/__tests__/sandataResolver.test.js` covers the resolver; add/adjust any controller test that referenced the old single-map signature.

**Interfaces:**
- Consumes: new `buildLiveSandataMap` bundle + `resolveShiftAccountNumber`/`resolveShiftSandataId`.
- Produces: shared view shifts carry resolved `accountNumber` + `sandataClientId`.

- [ ] **Step 1: Update the import and enrichment block**

Line 3 — change import to:

```javascript
const { buildLiveSandataMap, resolveShiftAccountNumber, resolveShiftSandataId } = require('../lib/sandataResolver');
```

Lines 106–114 — replace with:

```javascript
    const liveMaps = buildLiveSandataMap(auths);

    const enrichedShifts = shifts.map(s => {
        const accountNumber = resolveShiftAccountNumber(s, liveMaps);
        return {
            ...s,
            accountNumber,
            sandataClientId: resolveShiftSandataId(s, accountNumber, liveMaps),
            serviceLabel: (SERVICE_COLOR_MAP[s.serviceCode] || {}).label || s.serviceCode,
        };
    });
```

- [ ] **Step 2: Run the related tests**

Run: `cd server && npx jest sandataResolver employeeScheduleLink 2>&1 | tail -20`
Expected: PASS (fix any test still importing `resolveShiftSandataId(shift, map)` with the old 2-arg signature).

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/employeeScheduleLinkController.js
git commit -m "feat(scheduling): shared schedule view uses account-keyed resolver bundle"
```

---

### Task 5: Stop persisting account/Sandata on shift writes; remove auth→shift propagation

**Files:**
- Modify: `server/src/controllers/schedulingController.js` (create ~380/396/433; update ~554; bulk ~1019/1164/1165/1241/1242; audit diffs ~617/1038/1200)
- Modify: `server/src/controllers/authorizationController.js:233-236,254-257`
- Test: `server/src/controllers/__tests__/schedulingBulkAndDelete.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: shift rows always store `accountNumber: ''` and `sandataClientId: ''`; auth edits no longer `updateMany` shifts.

- [ ] **Step 1: Write failing tests**

Add tests to `schedulingBulkAndDelete.test.js`:
1. Create a shift with request body containing `accountNumber: 'X'` and `sandataClientId: 'Y'`; assert the persisted row (via `prisma.shift.findUnique`) has `accountNumber === ''` and `sandataClientId === ''`.
2. Update an authorization's `sandataClientId`; assert no shift row's stored `sandataClientId` changed (it stays `''`).

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npx jest schedulingBulkAndDelete -t "does not persist" 2>&1 | tail -20`
Expected: FAIL — stored values equal `'X'`/`'Y'`.

- [ ] **Step 3: Remove writes in the create paths**

`schedulingController.js` bulk create (~396): change `sandataClientId: entry.sandataClientId || sandataClientId || '',` to `sandataClientId: '',` and set `accountNumber: ''` (replace the `entryAccount` write at ~395). Single create `baseData` (~432-433): set `accountNumber: ''` and `sandataClientId: ''`. Leave the request-body destructuring intact (harmless) or remove the unused vars.

- [ ] **Step 4: Remove writes in update + bulk-edit paths**

`updateShift` (~554): delete the `if (sandataClientId !== undefined) data.sandataClientId = sandataClientId;` line and the equivalent `accountNumber` assignment. Bulk-edit (~1019, ~1164-1165, ~1241-1242): delete the `data.sandataClientId`/`data.accountNumber` assignments. In the audit `diffFields` arrays (~617, ~1038, ~1200) remove `'accountNumber'` and `'sandataClientId'` from the field lists.

- [ ] **Step 5: Remove both auth→shift propagation blocks**

`authorizationController.js`: delete the `prisma.shift.updateMany({...})` block at ~233-236 (account) and ~254-257 (Sandata). Keep the `authorization.update` calls and responses.

- [ ] **Step 6: Run to verify pass**

Run: `cd server && npx jest schedulingBulkAndDelete authorization 2>&1 | tail -25`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/schedulingController.js server/src/controllers/authorizationController.js server/src/controllers/__tests__/schedulingBulkAndDelete.test.js
git commit -m "feat(scheduling): stop persisting account/Sandata on shifts; drop auth propagation"
```

---

### Task 6: Verify Sandata import does not stamp shifts

**Files:**
- Inspect: `server/src/controllers/sandataController.js:145-210`
- Test: none unless a shift write is found.

- [ ] **Step 1: Inspect**

Run: `cd server && grep -n "prisma.shift" src/controllers/sandataController.js`
Expected: no `prisma.shift.update`/`updateMany` writing `accountNumber`/`sandataClientId`. The writes at ~166/205 target `authorization` (correct — source of truth).

- [ ] **Step 2: If a shift write exists, remove it and add a note**

If (and only if) a `prisma.shift.*` write of `accountNumber`/`sandataClientId` exists, delete it (the value is now derived live). Commit:

```bash
git add server/src/controllers/sandataController.js
git commit -m "fix(sandata): stop stamping account/Sandata onto shifts on import"
```

If no such write exists, skip the commit (no change needed).

---

### Task 7: Scheduling page — read-only account + Sandata with copy button and tooltip

**Files:**
- Modify: `client/src/pages/SchedulingPage.jsx` (create form ~632; per-day rows ~799; bulk-edit rows ~1850, ~1911; view line ~982)
- Modify: `client/src/index.css` (small styles for the read-only + copy affordance, following existing token usage)

**Interfaces:**
- Consumes: resolved `accountNumber` + `sandataClientId` already present on shift objects from the API (Tasks 3–4).

- [ ] **Step 1: Add a small read-only display+copy component**

In `SchedulingPage.jsx`, add a local component (above the page component) that renders the resolved value read-only with a one-click copy button and an info tooltip. Reuse existing icon components from `components/common/Icons.jsx` (e.g. a copy icon) and the app's existing tooltip/title pattern:

```jsx
function ResolvedIdField({ value, label }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <span className="resolved-id" title={`To change the ${label}, edit it on the client's authorization (client-details page).`}>
      <span className="resolved-id__value">{value || '—'}</span>
      {value && (
        <button type="button" className="resolved-id__copy" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? '✓' : '⧉'}
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Replace the editable inputs with the read-only field**

Replace each editable Sandata ID / account-number `<input>` in the create form (~632), per-day rows (~799), bulk-edit rows (~1850, ~1911), and the view line (~982) with `<ResolvedIdField value={...} label="Sandata Client ID" />` (or `label="account number"`), reading the resolved value from the shift/edit object. Remove now-unused `onChange`/state setters for these two fields where they only fed the removed inputs. Do NOT send `accountNumber`/`sandataClientId` in create/update request bodies (the server ignores them now, but drop them for clarity).

- [ ] **Step 3: Add minimal styles**

In `client/src/index.css`, add `.resolved-id`, `.resolved-id__value`, `.resolved-id__copy` styles using existing spacing/color tokens (match the muted, inline look of adjacent read-only cells). No new color tokens.

- [ ] **Step 4: Build the client to verify it compiles**

Run: `cd client && npm run build 2>&1 | tail -15`
Expected: build succeeds, no unresolved-symbol errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/SchedulingPage.jsx client/src/index.css
git commit -m "feat(scheduling): read-only account+Sandata with copy button and info tooltip"
```

---

### Task 8: Full backend suite + manual verification

**Files:** none (verification).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd server && npm test 2>&1 | tail -30`
Expected: all pass. Fix any test still asserting old behavior (stored copies, old resolver signature, propagation).

- [ ] **Step 2: Manual check against the local restored DB**

Start the server against the local `nvbestpca` DB, open the Scheduling page for a client known to have drifted stored values (e.g. Blanca Thacker / PCS), and confirm the displayed Sandata ID and account number match the client-details (authorization) values, are read-only, copy works, and the tooltip explains where to edit. Confirm a client with no auth ID shows `—` with no copy button.

- [ ] **Step 3: Commit any test fixups**

```bash
git add -A
git commit -m "test(scheduling): align suite with live account+Sandata resolution"
```

---

## Self-Review Notes

- **Spec coverage:** resolver (Task 1) ✓; enrichment/N+1 avoidance (Task 2) ✓; admin list read surface (Task 3) ✓; shared view (Task 4) ✓; write paths + propagation removal (Task 5) ✓; sandata import check (Task 6) ✓; read-only UI + copy + tooltip (Task 7) ✓; testing/regression (Tasks 1-3,5,8) ✓; out-of-scope respected (no migration, no data cleanup).
- **Type consistency:** `buildLiveSandataMap` returns the same bundle shape used by `enrichShiftLive`, `getScheduleView`, and `employeeScheduleLinkController`; `resolveShiftAccountNumber(shift, maps)` and `resolveShiftSandataId(shift, derivedAccount, maps)` signatures are consistent across all tasks.
- **No placeholders:** each code step shows the actual code; test steps that reuse the existing seeding harness reference the concrete file and concrete assertions.
