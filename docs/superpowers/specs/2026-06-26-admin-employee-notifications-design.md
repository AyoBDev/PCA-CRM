# Admin Notifications for Employee-App Events — Design

Date: 2026-06-26
Branch: `admin-employee-notifications`
Scope: surface employee-app-originated events on the admin client (Dashboard attention items, sidebar badge, per-event toast), plus a one-line fix to the employee AvailabilityPage payload.

## Goal

Admins must know when employees do something that needs attention. Today the admin only finds out by going to look. This work pushes four event types into three admin surfaces:

**Event types:**
1. **Cert pending review** — employee uploaded or replaced a certification; `EmployeeCertification.status === 'pending'`
2. **Time-off pending** — `TimeOffRequest.status === 'pending'`
3. **Availability change pending** — `AvailabilityRequest.status === 'pending'`
4. **Profile change** — `AuditLog` entries with `entityType: 'Employee'`, `action: 'UPDATE'`, where the actor is the employee themselves (`userId === employee.userId`)

**Surfaces:**
1. **Dashboard attention items** — extend the existing `attentionItems` list on `/dashboard` with one entry per non-zero event count
2. **Sidebar count badge** — reuse the existing `.sidebar__nav-pill` pattern on the `Employees` nav button
3. **Per-event toast** — once per (event, admin user) on the first admin-page load after the event

**Bug fix included:** Employee `AvailabilityPage` currently sends `{ schedule: form }`; server expects `{ requestedChanges }`. This branch fixes the payload key.

## Non-Goals

- No email or SMS notifications (Brevo integration stays out of scope)
- No socket-based push (poll instead)
- No new admin pages — existing `/dashboard`, `/employees/:id`, sidebar are the only touchpoints
- No changes to existing review workflows (cert approve/reject, time-off approve/deny, availability accept exists on the admin side or is handled elsewhere — out of scope for this branch)
- No new attention-item categories beyond the four above (e.g., we don't surface "task complete" events)

## Design system constraint

Reuse admin tokens, badge classes, and the existing `.sidebar__nav-pill` and Dashboard attention-list patterns. No new visual primitives.

## Development discipline — TDD

- Backend: every controller change written test-first using the existing Jest + `jest.mock('../../lib/prisma')` pattern in `server/`.
- Frontend admin: the admin app has no test runner today. Out of scope to add one for this work — manual smoke verification, with the changes isolated to small, easily reviewable additions.
- Employee-app: the one-line `AvailabilityPage` payload fix is covered by a manual smoke verification (the page calls `api.submitAvailabilityRequest({ requestedChanges: form })` and gets a 201, not a 400).

## Architecture

### New backend files

```
server/
  prisma/migrations/2026-06-26-admin-event-seen/
    migration.sql                                       # new AdminEventSeen table
  src/controllers/
    adminEmployeeAttentionController.js                 # GET + POST endpoints
  src/controllers/__tests__/
    adminEmployeeAttentionController.test.js            # Jest tests
```

### Schema addition (`server/prisma/schema.prisma`)

```prisma
model AdminEventSeen {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  eventKey  String   @map("event_key")
  seenAt    DateTime @default(now()) @map("seen_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, eventKey])
  @@index([userId])
  @@map("admin_event_seen")
}
```

The `User` model gets a `seenAttentionEvents AdminEventSeen[]` relation.

`eventKey` format examples:
- `cert-pending:{certId}` — clears via state (cert status changes), so this row exists only when admin clicks "mark seen" for the toast (it's the toast-suppression flag, not the chip clearer)
- `time-off-pending:{requestId}` — same
- `availability-pending:{requestId}` — same
- `profile-change:{auditLogId}` — both chip clearer AND toast suppressor (profile changes have no real lifecycle so admin must mark them seen)

### Routing logic

| Event | Chip clears when | Toast suppressed when |
|-------|------------------|------------------------|
| Cert pending review | `EmployeeCertification.status !== 'pending'` | `AdminEventSeen` row exists for `cert-pending:{certId}` AND this admin |
| Time-off pending | `TimeOffRequest.status !== 'pending'` | `AdminEventSeen` row exists for `time-off-pending:{requestId}` AND this admin |
| Availability change pending | `AvailabilityRequest.status !== 'pending'` | `AdminEventSeen` row exists for `availability-pending:{requestId}` AND this admin |
| Profile change | `AdminEventSeen` row exists for `profile-change:{auditLogId}` AND this admin | (same as left — chip and toast clear together) |

### New endpoints

**`GET /api/admin/employee-attention`**

Auth: `requireRole('admin', 'user')` with `requirePermission('employees')`.

Response:
```json
{
  "counts": {
    "certsPendingReview": 3,
    "timeOffPending": 1,
    "availabilityPending": 0,
    "profileChangesUnseen": 2
  },
  "recentEvents": [
    { "eventKey": "cert-pending:42", "type": "cert-pending", "employeeId": 7, "employeeName": "Jane Doe", "subject": "CPR", "createdAt": "2026-06-26T18:00:00Z" },
    { "eventKey": "profile-change:1234", "type": "profile-change", "employeeId": 8, "employeeName": "Bob Smith", "subject": "phone", "createdAt": "2026-06-26T17:00:00Z" }
  ]
}
```

`recentEvents` contains items the admin has NOT yet seen (no matching `AdminEventSeen` row for this user). Capped at 10. Sorted by createdAt desc. Used by the toast logic.

Counts are derived independently:
- `certsPendingReview` — `prisma.employeeCertification.count({ where: { status: 'pending' } })`
- `timeOffPending` — `prisma.timeOffRequest.count({ where: { status: 'pending' } })`
- `availabilityPending` — `prisma.availabilityRequest.count({ where: { status: 'pending' } })`
- `profileChangesUnseen` — count of qualifying `AuditLog` rows MINUS the count this admin has marked seen (left-anti-join on `AdminEventSeen` keyed by `profile-change:{auditLogId}`)

**`POST /api/admin/employee-attention/mark-seen`**

Auth: same.

Body: `{ eventKey: string }` or `{ eventKeys: string[] }` (accept both for the toast-batch case).

Behavior: upsert one `AdminEventSeen` row per `(userId, eventKey)`. Returns `{ success: true }`.

### Existing frontend files modified

```
client/src/
  api.js                                                # add 2 new methods
  pages/DashboardPage.jsx                               # consume attention counts, extend attentionItems
  pages/EmployeeDetailPage.jsx                          # honor URL hash for initial tab selection
  components/layout/Sidebar.jsx                         # add count badge to Employees nav button
  hooks/useEmployeeAttention.js                         # NEW — context provider, 60s poll
  components/Layout.jsx (or wherever ToastProvider sits) # NEW — drive toasts from useEmployeeAttention
employee-app/src/
  pages/AvailabilityPage.jsx                            # one-line payload key fix
```

### Frontend hook contract

`useEmployeeAttention()` returns:
```js
{
  counts: { certsPendingReview, timeOffPending, availabilityPending, profileChangesUnseen },
  totalCount: number,            // sum of all four
  recentEvents: [{ eventKey, type, employeeId, employeeName, subject, createdAt }],
  markSeen: (eventKey | eventKey[]) => Promise<void>,
  refresh: () => Promise<void>,
  loading: boolean,
}
```

Provider polls every 60s while `document.visibilityState === 'visible'`, gated on `useAuth().authUser` (don't poll on the login page).

### Dashboard integration

In `DashboardPage.jsx`, add four entries to the existing `attentionItems` array, each:
```jsx
if (counts.certsPendingReview > 0) attentionItems.push({
  icon: Icons.alertCircle,
  label: `${counts.certsPendingReview} certification${counts.certsPendingReview > 1 ? 's' : ''} awaiting review`,
  severity: 'warning',
  action: () => navigate('/employees?filter=certsPending')
});
```

For routing: since the user chose "direct to the relevant employee tab," each item routes to the FIRST employee with that pending event, opening their detail page on the correct tab. We add a small helper on the server: `recentEvents[0]` for each event-type gets used as the click target. If multiple employees have pending items, the chip click takes the admin to the most recent one; the others remain visible on the Employees list page.

Alternative considered and rejected: a single list page per event type. Rejected because the user chose "direct to employee tab"; this matches.

### Sidebar integration

`Sidebar.jsx` line 127 (the Employees button):

```jsx
<button className={`sidebar__nav-item ${activePage === 'employees' ? 'sidebar__nav-item--active' : ''}`} onClick={() => nav('/employees')} title="Employees">
  {Icons.user} Employees
  {totalCount > 0 && (
    <span className="sidebar__nav-pill">{totalCount > 99 ? '99+' : totalCount}</span>
  )}
</button>
```

The `totalCount` comes from `useEmployeeAttention()`.

### EmployeeDetailPage hash routing

Line 326 today:
```jsx
const [activeTab, setActiveTab] = useState('profile');
```

Changes to:
```jsx
const location = useLocation();
const initialTab = useMemo(() => {
  const map = { '#certs': 'certifications', '#availability': 'availability', '#profile': 'profile', '#timesheets': 'timesheets', '#schedule': 'schedule' };
  return map[location.hash] || 'profile';
}, [location.hash]);
const [activeTab, setActiveTab] = useState(initialTab);
useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
```

Imports: add `useLocation`, `useMemo` to the existing react/router imports.

### Toast integration

In the Layout component (or wherever `ToastProvider` mounts), wire `useEmployeeAttention().recentEvents` to a `useEffect` that:
1. On every poll where `recentEvents` changed
2. For each new event the admin hasn't already toasted about (track in-memory `Set<eventKey>` ref):
3. Show one toast per event (queued, not concurrent)
4. After 3 seconds (existing toast TTL), call `markSeen([...eventKeys])` to persist

The in-memory Set prevents re-toasting if the poll returns the same events before `markSeen` lands. The persistent `AdminEventSeen` row prevents re-toasting across page reloads.

### Profile-change detection (server-side)

In `getEmployeeAttention`, the qualifying `AuditLog` query is:
```js
prisma.auditLog.findMany({
  where: {
    entityType: 'Employee',
    action: 'UPDATE',
    userRole: 'pca',
    // Where the userId matches the userId of the Employee being updated:
    // This requires joining via Employee.userId. We do this in two steps:
    // 1) Get auditLog entries with entityType=Employee, action=UPDATE, userRole=pca
    // 2) Match those rows where the audited entityId's Employee.userId === auditLog.userId
  }
});
```

Two-step because Prisma can't express the join in one `where`. Documented as such — we'll post-filter in JavaScript after the initial query. Cap query at the most recent 100 audit rows to keep this cheap.

### Bug fix to `AvailabilityPage`

`employee-app/src/pages/AvailabilityPage.jsx` line 49 (or wherever the call now lives):
```js
// BEFORE:
await api.submitAvailabilityRequest({ schedule: form });
// AFTER:
await api.submitAvailabilityRequest({ requestedChanges: form });
```

This is one line. Add a Vitest test in `AvailabilityPage.test.jsx` that mocks `api.submitAvailabilityRequest` and asserts it's called with `{ requestedChanges: <form> }` after the save button is pressed.

## Error handling

- Provider endpoint failures: `useEmployeeAttention()` returns `loading: false` with zeroed counts; sidebar badge hidden, Dashboard items hidden.
- `markSeen` failures: silent retry on next poll. Toasts may re-appear; acceptable.
- Profile-change post-filter: if the join produces no employee record (e.g., audit log for a deleted employee), skip that row.

## Verification

### Backend tests (Jest, written test-first)

`adminEmployeeAttentionController.test.js`:
- `getEmployeeAttention` — returns correct counts when various tables have pending/unseen rows
- `getEmployeeAttention` — `profileChangesUnseen` correctly subtracts rows this admin has already marked seen
- `getEmployeeAttention` — non-admin/non-employees-permission user gets 403
- `markSeen` — single eventKey creates one row; idempotent on repeat call
- `markSeen` — array of eventKeys creates multiple rows
- `markSeen` — unknown user gets 401

### Employee-app test

`AvailabilityPage.test.jsx` (new):
- Save button submits `{ requestedChanges: <form state> }` to `api.submitAvailabilityRequest`

### Manual admin-side smoke checklist

After backend + frontend changes land:
- [ ] Upload a cert from the employee-app. Within 60s the admin Dashboard shows "1 certification awaiting review" and the sidebar Employees pill shows `1`.
- [ ] Click the Dashboard chip. Land on `/employees/:id` with the Certifications tab active.
- [ ] Approve/reject the cert. Within 60s the chip and pill clear.
- [ ] Submit a time-off request from the employee-app. Admin Dashboard shows "1 time-off request pending." Click → land on `/employees/:id#availability`.
- [ ] Submit an availability change. Admin Dashboard shows "1 availability change pending." Click → land on the same tab.
- [ ] Edit profile field (phone) from the employee-app. Admin Dashboard shows "1 profile change." Click → land on `/employees/:id#profile`. Admin reviews. Either click "mark seen" or the chip clears after toast suppression.
- [ ] On a fresh admin tab (or after the toast TTL passes), the first event triggers a toast. Subsequent reloads do NOT re-toast the same event.
- [ ] Sidebar pill shows the sum of all four counts; updates within 60s.

## Implementation order

**Pass 0 — prisma migration**
1. Add `AdminEventSeen` model to `schema.prisma`, add the relation field on `User`, create migration `2026-06-26-admin-event-seen`.

**Pass 1 — backend (TDD)**
2. Write failing test for `getEmployeeAttention`, then implement.
3. Write failing test for `markSeen`, then implement.
4. Register both routes in `server/src/routes/api.js`.

**Pass 2 — frontend admin**
5. Add `api.getEmployeeAttention()` and `api.markAttentionSeen()` to `client/src/api.js`.
6. Create `client/src/hooks/useEmployeeAttention.jsx` (provider + hook).
7. Wire provider into `Layout.jsx` (or wherever AuthProvider wraps).
8. Update `Sidebar.jsx` Employees button with `.sidebar__nav-pill`.
9. Update `DashboardPage.jsx` attention items array.
10. Update `EmployeeDetailPage.jsx` for URL-hash tab routing.
11. Wire toast effect (reads `recentEvents`, dispatches toasts, calls `markSeen`).

**Pass 3 — employee-app fix**
12. Write Vitest test for AvailabilityPage payload shape.
13. Fix `submitAvailabilityRequest` call from `{ schedule: form }` to `{ requestedChanges: form }`.

**Pass 4 — verification**
14. `cd server && npm test` — backend new + existing green (modulo the 3 pre-existing failing suites we already documented).
15. `cd employee-app && npm test` — all green including new AvailabilityPage test.
16. Manual smoke checklist on running dev environment.
