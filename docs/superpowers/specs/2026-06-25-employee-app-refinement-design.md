# Employee-App Refinement — Design

Date: 2026-06-25
Branch: `employee-app-refinement`
Scope: visual + functional refinement of five existing employee-app pages (Home, Schedule, Requirements, Account/Availability, Messages). Primitives-first approach.

## Goal

Refine the existing employee-app so it reflects this UX:

- **Home** — compliance alert banner if a cert is overdue, summary chips (shifts this week, hours, cert status, messages), a Next Shift card, a 7-day week strip with hours per day, and a recent activity feed.
- **Schedule** — day-grouped shift cards (unchanged), with a new header showing week total hours, shift count, and per-client hour breakdown. Deep-linkable from the Home week-strip via `?date=YYYY-MM-DD`.
- **Requirements** (under Account) — 4 summary tiles (Approved / Pending / Action Needed / Total) and 8 cert cards (TB Test, CPR, Annual Training, Cultural Competency, Infection Control, Background Check, ID, Other) with colored left borders by status and an Upload/Replace button.
- **Account** — profile header with a compliance badge, and count pills on Certifications and Tasks rows. Requirements stays nested under Account.
- **Availability** (under Account) — day toggles with shift times, save via existing endpoint, time-off request list with status badges, inline form to request time off.
- **Messages** — chat layout already correct; polish only (sender label, unread divider, date separators, auto-scroll, mark-read on open).

The bottom nav (Home, Schedule, Timesheet, Messages, Account) is unchanged.

## Non-Goals

- No nav restructure
- No push notifications wiring
- No socket-stream activity feed (poll instead)
- No read receipts, typing indicators, or message reactions
- No Timesheet, Pay Stubs, or Onboarding changes
- No new Vitest setup (manual smoke verification)

## Architecture

The work is primitives-first: build reusable hooks and components in pass 1, then assemble pages in pass 2. The bottom nav and routing are unchanged.

### New files

```
employee-app/src/
  hooks/
    useNotifications.jsx          # single source for action-needed counts + compliance state
  utils/
    certTypes.js                  # CERT_TYPES constant (8 names, ordered)
  components/common/
    ComplianceBanner.jsx          # red banner shown when complianceState === 'overdue'
    ComplianceBadge.jsx           # green/amber/red pill for Account header
    SummaryChip.jsx               # icon + label + value pill
    NextShiftCard.jsx             # extracted from current HomePage
    WeekStrip.jsx                 # 7-day mini-strip with hours per day, today ringed
    ActivityFeed.jsx              # list container for activity items
    ActivityFeedItem.jsx          # single feed row (icon, title, subtitle, timestamp, href)
    CertCard.jsx                  # one cert slot (status-colored left border)
    CertSummary.jsx               # 4-tile row (Approved/Pending/Action/Total)
    NotificationCountPill.jsx     # red pill with a count, used on Account rows
    AvailabilityDayRow.jsx        # toggle + time-in/time-out inputs
    TimeOffRequestRow.jsx         # date range + status badge + reason
    ScheduleWeekHeader.jsx        # week total + per-client breakdown card
```

### Modified files (pass 2)

- `pages/HomePage.jsx`
- `pages/SchedulePage.jsx`
- `pages/CertificationsPage.jsx`
- `pages/AccountPage.jsx`
- `pages/AvailabilityPage.jsx`
- `pages/MessagesPage.jsx`
- `src/index.css` — additions only (no deletions)
- `App.jsx` — wrap `ProtectedRoutes` with `NotificationsProvider`

### Backend additions

Two additive changes. No destructive schema changes.

1. **Widen `/api/employee/home/activity`** in `server/src/controllers/employeePortal/homeController.js` to return a unified feed of recent events for the authenticated employee, drawn from existing tables. Event types:
   - `new-shift` — shift created where `employeeId = me`
   - `shift-changed` — shift updated (date/time/client) where `employeeId = me`
   - `admin-message` — chat message from admin received by me
   - `cert-uploaded`, `cert-approved`, `cert-rejected` — from `AuditLog` filtered to my employee record
   - `task-assigned` — task created for me
   - `time-off-decided` — time-off request approved or denied
   - Sorted desc by timestamp, capped at 20 items.

2. **New endpoint `POST /api/employee/certifications`** for self-upload of a missing cert. Body is multipart with fields: `certType` (one of `CERT_TYPES`), optional `expirationDate`, and the file. Creates a new cert row and stores the file via the existing `storageService`. Audit log entry: `entityType: 'Certification'`, `action: 'CREATE'`, `userId: req.user.id`. The existing `POST /certifications/:certId/upload` is preserved for replacing an existing cert.

### Data flow

`NotificationsProvider` (wrapping `ProtectedRoutes`) calls `useNotifications` internally and exposes context. It fetches:

- `api.getCertifications()` → derives `certs`, `certsByType` (Map keyed by `CERT_TYPES`, `null` for missing), `certsApproved`, `certsPending`, `certsActionNeeded`, `certsTotal` (always 8).
- `api.getTasks()` → derives `tasksOpen` (count where `!completed`).
- `api.getMessageUnreadCount()` → `unreadMessages`.

Derived `complianceState`:
- `overdue` — any cert is expired or missing
- `attention` — none expired/missing, but at least one expiring within 30 days OR `tasksOpen > 0`
- `compliant` — neither of the above

Polls every 60s while `document.visibilityState === 'visible'`. Pauses when hidden. Exposes `refresh()` for callers (cert upload, task complete, message send).

If any individual endpoint fails, that slice stays `null` and dependent UI hides itself rather than rendering misleading numbers; other slices still render.

## Page assemblies

### Home

Stack (top to bottom):

1. Greeting: `Hi, {firstName}`
2. `ComplianceBanner` — visible only when `complianceState === 'overdue'`. Links to `/account/certs`.
3. `NextShiftCard` — same look as today, fed by `api.getNextShift()`. Empty state preserved.
4. `WeekStrip` — fed by `api.getWeekSchedule(thisSunday)`. Days with shifts get blue background and hour count. Today gets a 2px ring. Tap → `/schedule?date=YYYY-MM-DD`.
5. Week total summary line: `28 hrs · 4 shifts`.
6. `SummaryChip` row — shifts this week, hours scheduled, cert-status chip (color from `complianceState`), unread messages chip. Cert chip → `/account/certs`. Messages chip → `/messages`.
7. `ActivityFeed` — top 5 items from `/home/activity`. If more than 5 items exist, an inline "See more" toggle expands to show up to 20 (the server cap). No dedicated activity page; this stays inline.

Loading: skeleton placeholders for NextShiftCard and WeekStrip. Chips and banner gate on `useNotifications`. If `/home/summary` fails, chips hide silently.

### Schedule

Day-grouped cards unchanged. Adds a `ScheduleWeekHeader` card above the day list. The header shows:

- Top row: `WEEK TOTAL`, `{X} hrs · {Y} shifts`
- Below: a small per-client list, sorted by hours descending, e.g. `Jane Doe  12 hrs`

Empty week → header reads `No shifts this week`; existing list-level empty state is suppressed (avoid two "no shifts" messages).

Deep link: reads `?date=YYYY-MM-DD`. If present, sets `sunday` to that week and scrolls the matching day heading into view.

Time math: local helper `hoursBetween(start, end)` that handles overnight (`end < start → +24h`).

Loading: header shows two grey skeleton bars. On fetch failure, header shows a retry button.

### Requirements (`/account/certs`)

Layout:

1. `CertSummary` — 4 tiles: Approved, Pending, Action Needed, Total (always 8). Not tappable.
2. 8 `CertCard`s in `CERT_TYPES` order. Each card shows: title, status badge, expiration date (if any), last uploaded date (if any), and an Upload (missing) or Replace (present) button.

Status logic per card (`certStatus(cert)`):

- `null` → `missing` (red border, "Upload" button)
- `expirationDate < today` → `expired` (red border, "Replace" button)
- `expirationDate ≤ today + 30d` → `expiring` (amber border, "Replace" button)
- `expirationDate > today + 30d` → `approved` (green border, "Replace" button)
- no `expirationDate` but uploaded → `pending` (grey border, "Replace" button)

`CertSummary` counts:
- Approved = `count(status === 'approved')`
- Pending = `count(status === 'pending')`
- Action Needed = `count(status in ['missing', 'expired', 'expiring'])`
- Total = 8

Any backend cert with `certType` outside `CERT_TYPES` folds into the **Other** slot. If multiple, the Other card lists them stacked inside.

Status color is the only color signal on the card (per-type colors dropped).

Upload flow:

- Tapping Upload (missing slot): native file picker → optional inline expiration date prompt → `POST /api/employee/certifications` with `{ certType, expirationDate?, file }`.
- Tapping Replace (existing slot): native file picker → optional inline expiration date prompt → existing `POST /api/employee/certifications/:certId/upload`.
- After success: `useNotifications().refresh()`. Inline error toast above the card on failure.
- File constraints: `image/*, application/pdf`, max 10 MB.

### Account

Header:

- Avatar + name + email (current layout retained)
- `ComplianceBadge` to the right of email or below name, three states (green/amber/red).

Rows (unchanged routes):

- `PAY STUBS` — no badge
- `CERTIFICATIONS` — `NotificationCountPill` showing `certsActionNeeded` when > 0
- `AVAILABILITY` — no badge
- `TASKS` — `NotificationCountPill` showing `tasksOpen` when > 0
- `EDIT PROFILE` — no badge

All counts come from `useNotifications()`; Account page itself fetches nothing.

### Availability

Layout:

1. `WEEKLY AVAILABILITY` heading
2. Seven `AvailabilityDayRow` rows (Sun → Sat). Toggle ON shows two time inputs; OFF hides them.
3. `Save weekly schedule` button — disabled until form differs from server state.
4. `TIME-OFF REQUESTS` heading
5. List of `TimeOffRequestRow` — date range, reason, status badge (`pending`/`approved`/`denied`).
6. `+ Request time off` button — opens inline form (start date, end date, reason).

Save: existing `api.submitAvailabilityRequest(schedule)`. The controller behavior (direct save vs. pending-review request) will be confirmed during implementation; button label and post-save UI will match. If it's a pending-review flow, the page shows a small banner above the rows when an unresolved request exists.

Time-off submit: existing `api.submitTimeOff(data)` with optimistic insert (`pending` badge), reconciled with the server response.

Loading: page-level skeleton until both `getAvailability()` and `getTimeOffRequests()` resolve.

### Messages

Bubble alignment unchanged. Additions:

- Sticky **"Office"** label above admin bubbles when sender changes
- Unread divider line above the first unread message on load
- Date separators between message groups when 24h+ gap
- Auto-scroll to latest on send and on socket receive
- `api.markRead()` fires on page open, then `useNotifications().refresh()` clears the messages chip on Home

No read receipts, typing indicators, or reactions.

## Components — interface contracts

### `useNotifications` (hook + provider)

Provider wraps `ProtectedRoutes`. Exposes:

```js
{
  certs,              // array
  certsByType,        // Map<certType, certRecord | null>
  certsApproved,      // number
  certsPending,       // number
  certsActionNeeded,  // number
  certsTotal,         // number (always 8)
  tasksOpen,          // number
  unreadMessages,     // number
  complianceState,    // 'compliant' | 'attention' | 'overdue'
  refresh,            // () => Promise<void>
  loading,            // boolean
}
```

### `ComplianceBanner` — `{ }` (reads context)
Renders only when `complianceState === 'overdue'`. Inline link to `/account/certs`.

### `ComplianceBadge` — `{ size? = 'md' }`
Reads `complianceState`, renders green/amber/red pill.

### `SummaryChip` — `{ icon?, label, value, href?, variant? }`
Pill with optional dot color (`variant`: `'success' | 'warning' | 'danger' | 'neutral'`). Tappable if `href` is set.

### `NextShiftCard` — `{ shift }`
Same look as current HomePage card. Falls back to empty state when `shift` is null.

### `WeekStrip` — `{ shifts, weekStart }`
7 cells. Days with shifts: blue background + hour count below day number. Today: 2px primary ring. Tap → `navigate('/schedule?date=YYYY-MM-DD')`.

### `ActivityFeed` — `{ items, limit = 5 }`
Renders `items.slice(0, limit)` as `ActivityFeedItem`s plus a "See more" if `items.length > limit`.

### `ActivityFeedItem` — `{ type, title, subtitle?, timestamp, href? }`
Icon resolved from `type`. Whole row tappable if `href` is set.

### `CertCard` — `{ slot }` where `slot = { certType, cert | null, status, others? }`
- Colored left border by `status` (green/amber/red/grey)
- Title row: `certType` + status badge
- Metadata: expiration date, last uploaded date (when present)
- Action button: Upload (missing) or Replace (present)
- If `others` is non-empty (Other slot only), renders a small inner list

### `CertSummary` — `{ approved, pending, actionNeeded, total }`
4 tiles in a row.

### `NotificationCountPill` — `{ count }`
Renders `null` when `count <= 0`; otherwise red pill with the number.

### `AvailabilityDayRow` — `{ day, value, onChange }`
- `value = { on, in, out }`
- Toggle, two `<input type="time">` inputs when on.

### `TimeOffRequestRow` — `{ request }`
Date range, reason, status badge.

### `ScheduleWeekHeader` — `{ shifts }`
Week total, shift count, per-client breakdown sorted by hours desc.

## Constants

`employee-app/src/utils/certTypes.js`:

```js
export const CERT_TYPES = [
  'TB Test',
  'CPR',
  'Annual Training',
  'Cultural Competency',
  'Infection Control',
  'Background Check',
  'ID',
  'Other',
];
```

## CSS additions (no deletions)

Added to `src/index.css`:

- `.cert-summary`, `.cert-summary__tile`, `.cert-summary__count`, `.cert-summary__label`
- `.cert-summary__tile--approved`, `--pending`, `--action`, `--total`
- `.week-strip`, `.week-strip__day`, `.week-strip__day--today`, `.week-strip__day--active`, `.week-strip__hours`
- `.activity-feed`, `.activity-item`, `.activity-item__icon`, `.activity-item__body`, `.activity-item__time`
- `.compliance-badge`, `.compliance-badge--compliant`, `--attention`, `--overdue`
- `.notification-pill`
- `.schedule-week-header`, `.schedule-week-header__total`, `.schedule-week-header__breakdown`, `.schedule-week-header__row`
- `.availability-day-row`, `.availability-day-row--off`, `.availability-day-row__toggle`, `.availability-day-row__times`
- `.timeoff-row`, `.timeoff-row__dates`, `.timeoff-row__reason`
- `.skeleton`, `.skeleton--text`, `.skeleton--card` — shimmer placeholders

Existing classes (`.shift-card`, `.cert-card`, `.badge`, `.stat-pill`, `.alert-banner`, etc.) are reused as-is.

## Error handling

- Provider endpoint failures: that slice is `null`; dependent UI hides
- Page-level fetch failures: inline retry button, no full-page blocker
- Upload failures: inline error toast above the card, file preserved client-side for retry
- Network offline: provider keeps last-known data; chips and badges show stale values without erroring; new request retried on next poll

## Verification (manual, no Vitest)

After each primitive lands:

- [ ] Compliance banner appears only when a cert is expired or missing
- [ ] WeekStrip highlights today, blue days match `/schedule/week` response
- [ ] All 8 cert slots render even when backend returns nothing
- [ ] "Other" slot folds in unknown cert types
- [ ] Account count pills clear after the underlying issue is fixed
- [ ] Availability form's Save is disabled until edits are made
- [ ] Time-off request inserts optimistically and reconciles with server
- [ ] Messages auto-scroll fires on send and on receive
- [ ] Messages unread divider appears once and disappears after scroll
- [ ] Deep link `/schedule?date=...` opens the correct week and scrolls
- [ ] Backend additions (widened `/home/activity`, `POST /employee/certifications`) work via the UI

Backend additions get a Jest test alongside existing employee-portal tests if a pattern exists; otherwise a single integration test via supertest.

Visual review in Chrome DevTools at iPhone 13 viewport (390×844) after each page assembly.

## Implementation order (primitives-first)

**Pass 1 — primitives**

1. `utils/certTypes.js`
2. `hooks/useNotifications.jsx` + `NotificationsProvider`
3. Wire provider into `App.jsx`
4. `ComplianceBanner`, `ComplianceBadge`, `NotificationCountPill`, `SummaryChip`
5. `WeekStrip`, `ScheduleWeekHeader`
6. `CertCard`, `CertSummary`
7. `ActivityFeed`, `ActivityFeedItem`
8. `NextShiftCard`, `AvailabilityDayRow`, `TimeOffRequestRow`
9. CSS additions to `index.css`

**Pass 2 — backend additions**

10. Widen `/api/employee/home/activity` to return unified feed
11. New `POST /api/employee/certifications` endpoint

**Pass 3 — page assemblies**

12. HomePage
13. SchedulePage (with `?date=` deep link)
14. CertificationsPage
15. AccountPage
16. AvailabilityPage
17. MessagesPage polish

**Pass 4 — verification**

18. Run the manual smoke checklist on iPhone viewport
19. Spot-check on desktop viewport (≥768px) since the left rail layout differs
