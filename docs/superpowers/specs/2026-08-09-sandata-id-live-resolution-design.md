# Sandata Client ID — Single Source, Live Resolution (Account-Keyed)

**Date:** 2026-08-09
**Status:** Approved (design), pending implementation
**Supersedes approach in:** `2026-08-07-sandata-id-owner-review-design.md` (the one-time cleanup / owner-review sheet). That cleanup remains valid history, but the durable fix is this: stop trusting the shift's stored copy entirely and resolve the Sandata Client ID live from the client's authorization.

## Problem

The Sandata Client ID has no single column of truth. It lives on `Authorization.sandataClientId` (the value shown on the client-details / Profile page — the source of truth) and is **also copied as free text onto each `Shift` row at creation** (`Shift.sandataClientId`). Those copies drift: analysis of production data found 1,329 drifted active shifts, including 62 that carried a *different client's* ID (the wrong-client-ID bug class).

The root cause is that shift create/update/bulk-edit accept `sandataClientId` from the request body and persist it, so every write is an opportunity to drift.

## Core Principle

**`Authorization.sandataClientId` is the sole source of truth.** No code writes or reads `Shift.sandata_client_id` for display. Every surface that shows a shift's Sandata ID resolves it live from the authorization. The stored `Shift.sandata_client_id` column stays in the DB but goes **dormant** — no migration, reversible, existing data inert.

The value is a property of **`(client, account number)`**, not `(client, service code)`: production data shows a client's Sandata ID is identical across all service codes that share an account number, and differs between account numbers. (Example — Elizabeth Harr: account 71040 → 955054, account 71120 → 155788, account 71635 → 335126.)

## Data Findings (production snapshot, 2026-08-09)

- 29,348 active shifts; 590 authorizations (525 with a Sandata ID); 258 clients.
- `(clientId, accountNumber)` → Sandata ID is **unambiguous** (0 pairs map to >1 id).
- `(clientName_normalized, serviceCode)` and `(clientName_normalized, accountNumber)` are also unambiguous (0 conflicts).
- 1,643 active shifts (5.6%) have a blank `accountNumber`; 411 of those still resolve via `clientId|serviceCode`.
- 1,232 shifts are unresolvable by ANY key — their client has no authorization carrying a Sandata ID for that account/service. There is no value to find; these render `—`.
- Name-based fallbacks add **0** coverage in current data; included only as defensive insurance for FK-mismatch edge cases (e.g. post-merge/re-import).

## Resolver Design

Location: `server/src/lib/sandataResolver.js` (extend existing pure helpers).

Build lookup maps from the authorization list (active auth wins over inactive for the same key; only non-empty Sandata IDs indexed):

- `byClientAccount`: `${clientId}|${accountNumber}` → id
- `byClientService`: `${clientId}|${serviceCode}` → id
- `byNameService`: `${normalizeName(clientName)}|${serviceCode}` → id

`resolveShiftSandataId(shift, maps)` resolution order — **first match wins**:

1. `clientId | accountNumber` (primary; skipped when shift.accountNumber is blank)
2. `clientId | serviceCode` (fallback for blank-account shifts)
3. `normalizeName(clientName) | serviceCode` (defensive last resort)
4. else → `''` (renders `—`)

`normalizeName` reuses the existing payroll normalization (lowercase, strip non-alphanumeric) so behavior matches the rest of the app. The resolver **no longer** falls back to the shift's stored `sandataClientId`.

**Signature change:** `buildLiveSandataMap(auths)` currently returns a single `clientId|serviceCode` map. It now returns a bundle of the three maps above (e.g. `{ byClientAccount, byClientService, byNameService }`), and `resolveShiftSandataId(shift, maps)` consumes that bundle. Every caller must be updated: `employeeScheduleLinkController.js` and its test, plus the new callers in `schedulingController.js`. The one-time cleanup script (`prisma/fix-shift-sandata-ids.js`) also imports these helpers — update it to the new signature (or leave the script pinned to a legacy helper; it is not part of the live path).

## Read Surfaces (all resolve live)

| Surface | File | Change |
|---|---|---|
| Shared/public schedule view | `employeeScheduleLinkController.js` | Already resolves live; update to new account-keyed maps. |
| Admin schedule API (enrichment) | `schedulingController.js` (`enrichShift` / list responses) | Enrich each returned shift with the **resolved** `sandataClientId` from auth, so the frontend receives the correct value pre-resolved. |
| Admin Scheduling page | `client/src/pages/SchedulingPage.jsx` (create form, per-day rows, bulk-edit rows, view line) | Inputs become **read-only** text showing the resolved value, each with a **one-click copy button** and an **info tooltip**: "To change this, edit the Sandata Client ID on the client's authorization (client-details page)." |
| Public view page render | `client/src/pages/scheduling/ScheduleViewPage.jsx` | No change — renders whatever the API resolved. |

## Write Paths (stop persisting request input)

| Path | File | Change |
|---|---|---|
| Create shift (single + bulk) | `schedulingController.js` (~396, ~433) | Do not persist request-body `sandataClientId`; write `''`. |
| Update shift | `schedulingController.js` (~554) | Remove `sandataClientId` from accepted update fields. |
| Bulk-edit shift | `schedulingController.js` (~1019, ~1165, ~1242) | Remove `sandataClientId` from the writable set. |
| Audit diffs | `schedulingController.js` (~617, ~1038) | Remove `sandataClientId` from `diffFields` lists. |
| Auth → shift propagation | `authorizationController.js` (~233, ~254) | Remove the Sandata-ID `updateMany` (dead effect now). **Keep `accountNumber` propagation** — that is separate and still needed (and, usefully, drives live Sandata resolution). |

## Edge Cases & Error Handling

- **Unresolved:** render `—`; copy button hidden/disabled when there is nothing to copy.
- **Blank shift accountNumber:** primary key skipped; falls through to serviceCode layers.
- **Active vs inactive auth for same key:** active wins.
- **Bulk-edit account change:** because the ID resolves off `accountNumber`, changing a shift's account automatically changes its displayed Sandata ID with no extra write.
- **Dormant column:** `Shift.sandata_client_id` is never read; stale data is inert; no cleanup performed.

## Testing (backend TDD; UI uses existing design system)

- **Resolver unit tests** (`server/src/lib/__tests__/sandataResolver.test.js`): layered order (account → serviceCode → name+serviceCode → blank); active-over-inactive; blank-account handling; no fallback to stored shift value; unambiguity assumptions.
- **Controller tests** (`schedulingBulkAndDelete.test.js` + create/update coverage): create/update/bulk do **not** persist a request-body `sandataClientId`; enriched responses carry the **resolved** value; changing a shift's `accountNumber` flips the resolved ID.
- **Regression:** shared schedule view still renders resolved IDs.

## Out of Scope

- No Prisma migration (column kept, dormant).
- No further `value_review` data cleanup of the stored column (it is no longer read).
- No changes to how authorizations themselves are edited (client-details page remains the single place to change the value).

## Non-Goals / YAGNI

- No per-shift Sandata override (would re-introduce drift).
- No name-based fallback for the account dimension (redundant with `clientId|accountNumber`).
