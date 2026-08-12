# Sandata Client ID + Account Number — Single Source, Live Resolution

**Date:** 2026-08-09
**Status:** Approved (design), pending implementation
**Supersedes approach in:** `2026-08-07-sandata-id-owner-review-design.md` (the one-time cleanup / owner-review sheet). That cleanup remains valid history, but the durable fix is this: stop trusting the shift's stored copies entirely and resolve BOTH the Sandata Client ID AND the account number live from the client's authorization.

## Scope note

This design covers **two** auth-owned values that currently drift as stored copies on `Shift`: `sandataClientId` and `accountNumber`. Both are fully derived from the authorization — never trusted from the stored shift column for display. `accountNumber` is derived first (keyed by `clientId|serviceCode`), and the derived account then feeds Sandata resolution (keyed by `clientId|accountNumber`). Verified safe: payroll/EVV does **not** read `shift.accountNumber` (payroll works off `PayrollVisit`, never joins `Shift`), so removing trust in the stored shift account has no billing impact. The only real consumers of a shift's account number are the schedule display surfaces and the `sandataController` import write path.

## Problem

The Sandata Client ID has no single column of truth. It lives on `Authorization.sandataClientId` (the value shown on the client-details / Profile page — the source of truth) and is **also copied as free text onto each `Shift` row at creation** (`Shift.sandataClientId`). Those copies drift: analysis of production data found 1,329 drifted active shifts, including 62 that carried a *different client's* ID (the wrong-client-ID bug class).

The root cause is that shift create/update/bulk-edit accept `sandataClientId` from the request body and persist it, so every write is an opportunity to drift.

## Core Principle

**`Authorization.sandataClientId` is the sole source of truth.** No code writes or reads `Shift.sandata_client_id` for display. Every surface that shows a shift's Sandata ID resolves it live from the authorization. The stored `Shift.sandata_client_id` column stays in the DB but goes **dormant** — no migration, reversible, existing data inert.

The value is a property of **`(client, account number)`**, not `(client, service code)`: production data shows a client's Sandata ID is identical across all service codes that share an account number, and differs between account numbers. (Example — Elizabeth Harr: account 71040 → 955054, account 71120 → 155788, account 71635 → 335126.)

## Data Findings (production snapshot, 2026-08-09)

- 29,348 active shifts; 590 authorizations (525 with a Sandata ID); 258 clients.
- Uniqueness (0 conflicts each — safe as resolution keys): `(clientId, serviceCode) → accountNumber`; `(clientId, accountNumber) → sandataId`; `(clientName_normalized, serviceCode) → {accountNumber, sandataId}`.
- 1,643 active shifts (5.6%) have a blank stored `accountNumber` — irrelevant now, since account is re-derived from the auth by `clientId|serviceCode`, not read from the shift.
- 1,232 shifts remain unresolvable by ANY key (including name fallbacks) — their client simply has no authorization Sandata ID for that service/account, so there is nothing to resolve. These render `—`.
- Name-based fallbacks add **0** coverage in current data; included only as defensive insurance for FK-mismatch edge cases (e.g. post-merge/re-import).

## Resolver Design

Location: `server/src/lib/sandataResolver.js` (extend existing pure helpers).

Build lookup maps from the authorization list (active auth wins over inactive for the same key; only entries with a non-empty target value are indexed):

For **account number**:
- `accountByClientService`: `${clientId}|${serviceCode}` → accountNumber
- `accountByNameService`: `${normalizeName(clientName)}|${serviceCode}` → accountNumber

For **Sandata ID**:
- `sandataByClientAccount`: `${clientId}|${accountNumber}` → id
- `sandataByClientService`: `${clientId}|${serviceCode}` → id
- `sandataByNameService`: `${normalizeName(clientName)}|${serviceCode}` → id

### Resolution order (account number FIRST, then Sandata off the derived account)

`resolveShiftAccountNumber(shift, maps)` — **first match wins**:
1. `clientId | serviceCode`
2. `normalizeName(clientName) | serviceCode`
3. else → `''` (renders `—`)

`resolveShiftSandataId(shift, derivedAccount, maps)` — **first match wins**:
1. `clientId | derivedAccount` (primary; skipped when derivedAccount is blank)
2. `clientId | serviceCode`
3. `normalizeName(clientName) | serviceCode`
4. else → `''` (renders `—`)

Account number is resolved by `clientId|serviceCode` (NOT by the shift's stored account) specifically to avoid a circular dependency — Sandata resolution keys off the *derived* account, so the account itself must derive from a key that does not depend on Sandata or the stored account. Both `(clientId, serviceCode) → accountNumber` and `(clientId, accountNumber) → sandataId` are proven unambiguous on production data (0 conflicts).

`normalizeName` reuses the existing payroll normalization (lowercase, strip non-alphanumeric). The resolver **no longer** falls back to the shift's stored `sandataClientId` or stored `accountNumber`.

**Signature change:** `buildLiveSandataMap(auths)` currently returns a single `clientId|serviceCode` map. It now returns a bundle of all maps above (e.g. `{ accountByClientService, accountByNameService, sandataByClientAccount, sandataByClientService, sandataByNameService }`). The two resolver functions consume that bundle. Every caller must be updated: `employeeScheduleLinkController.js` and its test, plus the new callers in `schedulingController.js` / `schedulingService.js`. The one-time cleanup script (`prisma/fix-shift-sandata-ids.js`) also imports these helpers — update it to the new signature (or leave it pinned to a legacy helper; it is not part of the live path).

### Enrichment mechanism (avoiding N+1)

`enrichShift(shift)` in `schedulingService.js` is currently pure/synchronous and cannot fetch auths per shift. The controller builds the auth maps **once per request** (as `getScheduleView` already does), then passes the bundle into enrichment. `enrichShift` gains an optional `maps` argument: when provided, it sets `shift.accountNumber = resolveShiftAccountNumber(...)` and `shift.sandataClientId = resolveShiftSandataId(...)` on the returned object so the frontend receives both values pre-resolved. When `maps` is omitted, it leaves the fields as-is (backward compatible).

## Read Surfaces (all resolve live — both accountNumber and sandataClientId)

| Surface | File | Change |
|---|---|---|
| Shared/public schedule view | `employeeScheduleLinkController.js` | Already resolves Sandata live; switch to the new bundle and also resolve `accountNumber`. |
| Admin schedule API (enrichment) | `schedulingService.js` `enrichShift` + `schedulingController.js` list/response paths | Controller builds the maps once; passes them to `enrichShift` so each returned shift carries the **resolved** `accountNumber` and `sandataClientId`. |
| Admin Scheduling page | `client/src/pages/SchedulingPage.jsx` (create form, per-day rows, bulk-edit rows, view line) | Both the Sandata ID and account-number inputs become **read-only** text showing the resolved value, each with a **one-click copy button** and an **info tooltip**: "To change this, edit it on the client's authorization (client-details page)." |
| Public view page render | `client/src/pages/scheduling/ScheduleViewPage.jsx` | No change — renders whatever the API resolved (both Account and Sandata columns). |

## Write Paths (stop persisting request input)

| Path | File | Change |
|---|---|---|
| Create shift (single + bulk) | `schedulingController.js` (~380, ~396, ~433) | Do not persist request-body `sandataClientId` OR `accountNumber`; write `''` for both. |
| Update shift | `schedulingController.js` (~554, ~1019) | Remove `sandataClientId` and `accountNumber` from accepted update fields. |
| Bulk-edit shift | `schedulingController.js` (~1164, ~1165, ~1241, ~1242) | Remove `sandataClientId` and `accountNumber` from the writable set. |
| Audit diffs | `schedulingController.js` (~617, ~1038, ~1200) | Remove `sandataClientId` and `accountNumber` from `diffFields` lists. |
| Sandata import | `sandataController.js` (~166, ~205) | Writes `accountNumber`/`sandataClientId` onto the **authorization** (correct — that's the source of truth). Verify it does NOT also write them onto shifts; if it does, drop the shift write. |
| Auth → shift propagation | `authorizationController.js` (~233, ~254) | Remove **both** `updateMany` blocks (Sandata-ID and account-number) — both are now dead writes onto a distrusted column. Live resolution replaces them. |

## Edge Cases & Error Handling

- **Unresolved (either value):** render `—`; copy button hidden/disabled when there is nothing to copy.
- **Blank derived accountNumber:** Sandata primary key skipped; falls through to Sandata serviceCode/name layers.
- **Active vs inactive auth for same key:** active wins (both maps).
- **Account no longer settable on a shift:** since both values derive from the auth, there is no per-shift account override anymore. Changing the auth's account (on the client-details page) changes every shift's displayed account AND Sandata ID live, with no shift write.
- **Dormant columns:** `Shift.sandata_client_id` and `Shift.account_number` are never read for display; stale data is inert; no cleanup performed.
- **Non-display consumers of stored account:** none in the live path (payroll uses `PayrollVisit`, not `Shift`). Confirmed by grep; must be re-confirmed if new consumers are added.

## Testing (backend TDD; UI uses existing design system)

- **Resolver unit tests** (`server/src/lib/__tests__/sandataResolver.test.js`):
  - `resolveShiftAccountNumber`: `clientId|serviceCode` → `name|serviceCode` → blank; active-over-inactive.
  - `resolveShiftSandataId`: `clientId|derivedAccount` → `clientId|serviceCode` → `name|serviceCode` → blank; blank-derived-account skips primary; active-over-inactive; **no fallback** to stored shift `sandataClientId` or `accountNumber`.
  - Ordering: account resolves before Sandata; a client with two accounts resolves the Sandata ID matching the account derived for that shift's service code.
- **Controller tests** (`schedulingBulkAndDelete.test.js` + create/update coverage): create/update/bulk do **not** persist request-body `sandataClientId` or `accountNumber`; enriched responses carry both **resolved** values; changing the auth account changes the resolved Sandata ID.
- **Regression:** shared schedule view still renders resolved Account + Sandata columns.

## Out of Scope

- No Prisma migration (both `sandata_client_id` and `account_number` columns kept, dormant).
- No further `value_review` data cleanup of the stored columns (they are no longer read).
- No changes to how authorizations themselves are edited (client-details page remains the single place to change either value).
- No changes to payroll/EVV (it does not read `Shift.accountNumber`).

## Non-Goals / YAGNI

- No per-shift Sandata or account override (would re-introduce drift).
- No name-based fallback for the Sandata account dimension (redundant with `clientId|accountNumber`).
