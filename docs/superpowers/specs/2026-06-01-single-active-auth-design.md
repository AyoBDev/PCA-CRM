# Single Active Authorization Per Service Code — Design Spec

## Overview

Enforce that only one authorization per service code can be active for a client at any time. When a new authorization is created (or renewed) for a service code that already has an active auth, the old one is automatically marked `manualStatus = 'inactive'`. Inactive/expired auths are only visible on the Client Detail page.

## Decisions

- **Deactivation method:** Set `manualStatus = 'inactive'` on the old auth (preserves original dates for historical reference)
- **Payroll transition period:** Visits use whichever auth was active at the time — `filterAuthsByWeek` already handles this correctly via date overlap checks + `manualStatus` filter
- **Retroactive cleanup:** A one-time migration deactivates existing duplicates, keeping the one with the latest start date as active
- **Visibility rule:** Inactive auths visible only on Client Detail page (ProgramsAuthTab already has status filter). All other views (AuthorizationsPage drawer, payroll, PCA form, dashboard, scheduling) only show active auths.

## Backend Changes

### Authorization Controller (`server/src/controllers/authorizationController.js`)

**`createAuthorization`:** After creating the new auth, find any other active authorization for the same `clientId + serviceCode` (where `manualStatus = 'active'` AND `archivedAt IS NULL` AND `id !== newAuth.id`) and update them to `manualStatus = 'inactive'`. Log each deactivation as an audit action.

**`updateAuthorization`:** If `serviceCode` is being changed, check if the new service code already has an active auth for that client — if so, deactivate it.

**`updateAuthManualStatus`:** If setting `manualStatus` to `'active'`, deactivate any other active auth with the same service code for the same client.

**`restoreAuthorization`:** When un-archiving (clearing `archivedAt`), if there's already an active auth with the same service code, deactivate it.

### Migration Script (`server/prisma/dedup-active-auths.js`)

One-time script to clean up existing duplicates:
1. Query all authorizations grouped by `clientId + serviceCode` where `manualStatus = 'active'` and `archivedAt IS NULL`
2. For groups with more than one active auth, keep the one with the latest `authorizationStartDate` (ties broken by highest `id`)
3. Set the rest to `manualStatus = 'inactive'`
4. Log count of deactivated records

Run via: `cd server && node prisma/dedup-active-auths.js`

### No Changes to Existing Read Logic

These already filter by `manualStatus === 'active'`:
- `filterAuthsByWeek()` in `authorizationService.js`
- Payroll auth cap logic in `payrollService.js`
- Dashboard authorization checks in `dashboardController.js`
- PCA form auth validation in `pcaFormController.js`
- Scheduling auth checks in `schedulingController.js`

## Frontend Changes

### AuthorizationsPage Drawer (`client/src/pages/AuthorizationsPage.jsx`)

Filter the authorization list in the client side drawer (line ~1412) to only show active, non-archived authorizations:

```javascript
(drawerClient.authorizations || [])
    .filter(a => (a.manualStatus || 'active') === 'active' && !a.archivedAt)
```

### No Other Frontend Changes

- Client Detail ProgramsAuthTab already has active/pending/inactive/all filter — inactive auths remain viewable there
- Payroll, PCA form, scheduling all use server-side filtering that already respects `manualStatus`

## File Changes Summary

| File | Change |
|------|--------|
| `server/src/controllers/authorizationController.js` | Auto-deactivate old auth on create/update/status-change/restore |
| `server/prisma/dedup-active-auths.js` | New: one-time migration to clean up existing duplicates |
| `client/src/pages/AuthorizationsPage.jsx` | Filter drawer auth list to active only |

## Out of Scope

- Changing the ProgramsAuthTab UI (already works correctly with status filter)
- Changing payroll/PCA form logic (already respects `manualStatus`)
- Adding UI notifications when an old auth gets auto-deactivated (admin sees it via audit log)
