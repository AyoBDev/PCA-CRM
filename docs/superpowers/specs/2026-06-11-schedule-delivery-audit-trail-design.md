# Schedule Delivery Audit Trail

## Problem

Caregivers miss visits and claim they never received their schedules. Management currently has no proof of:
- When a schedule was sent
- Whether the employee opened it
- Whether the employee acknowledged it

This creates compliance risk and unresolvable disputes.

## Solution

Add a tracking layer on top of the existing permanent-link scheduling system:
1. **Open tracking** — record when an employee views their schedule
2. **Employee acknowledgement** — Accept/Reject/Request Changes buttons on the schedule view page
3. **Bulk sending with custom messages** — select multiple employees, attach a note, send at once
4. **Inline delivery dashboard** — enhance the existing admin table to show full audit status per employee

## Existing Infrastructure (No Changes Needed)

- `ScheduleNotification` model with `sentAt`, `confirmedAt`, `response`, `respondedAt`, `confirmationToken`
- `EmployeeScheduleLink` model with permanent tokens per employee
- Backend endpoints: `POST /schedule/confirm/:token`, `PUT /schedule/respond/:token`
- `notificationService.js` with Brevo email + Twilio SMS
- `ScheduleViewPage.jsx` (public, no auth)
- `ScheduleDelivery.jsx` (admin send UI)

## Database Changes

### Modify `ScheduleNotification` model

Add three fields:

```prisma
model ScheduleNotification {
  // ... existing fields ...
  openedAt  DateTime?          // first time employee viewed the schedule
  message   String   @default("")  // admin's custom note included with send
  sentById  Int?               // which admin sent it
  sentByUser User?  @relation("ScheduleSentBy", fields: [sentById], references: [id])
}
```

Also add the reverse relation on `User`:

```prisma
model User {
  // ... existing fields ...
  sentScheduleNotifications ScheduleNotification[] @relation("ScheduleSentBy")
}
```

### Migration

Single migration: `add_schedule_notification_tracking`

## Backend Changes

### 1. New Endpoint: Record Schedule Open

`POST /api/schedule/view/:token/open`

**Public (no auth).** Called by the frontend when the schedule page loads.

Logic:
1. Look up the `EmployeeScheduleLink` by token
2. Derive the current week from `?weekStart` query param (or today's Sunday)
3. Find the most recent `ScheduleNotification` for that `employeeId` + `weekStart` where `openedAt IS NULL`
4. If found, set `openedAt = now()`
5. Idempotent: if already set, no-op
6. Return `{ success: true }`

This associates the open with the most recent send for that employee+week. If no notification exists (employee visited the link without being sent one), it's a no-op — no phantom records.

### 2. Modify `sendSchedules`

Accept additional fields in request body:
- `message` (string, optional) — custom note from admin
- Include `req.user.id` as `sentById` on each notification record

Store `message` and `sentById` on every `ScheduleNotification` created.

If `message` is provided, append it to the email HTML (above the schedule table) and SMS body (below the greeting).

### 3. Modify `getNotificationStatus`

Return all notifications for the week with full tracking data:
- Group by employee
- For each employee, return the most recent notification with: `sentAt`, `openedAt`, `confirmedAt`, `response`, `respondedAt`, `message`, `sentByUser.name`
- Also return a `history` array of all sends for repeat-send visibility

### 4. Add `sentBy` user name to responses endpoint

Existing `getScheduleResponses` already returns notifications — just ensure `sentByUser` is included in the query.

## Frontend Changes — Employee Side (`ScheduleViewPage`)

### Open Tracking

On component mount (after data loads successfully), fire:

```js
api.recordScheduleOpen(token, weekStart);
```

Fire-and-forget — don't block rendering or show errors. Only fires once per page load.

### Acknowledgement UI

Add a section below the schedule table (above the footer):

**If no pending notification exists for this week:** Show nothing (the employee is just browsing their schedule).

**If a notification exists and no response yet:**

```
┌─────────────────────────────────────────────────┐
│  Schedule Acknowledgement                        │
│                                                  │
│  [Admin message if any, shown in a blue card]    │
│                                                  │
│  Please confirm you've reviewed your schedule:   │
│                                                  │
│  [Accept Schedule]  [Request Changes]  [Reject]  │
│                                                  │
│  ┌─ Notes (optional) ──────────────────────────┐ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**If already responded:**

```
┌─────────────────────────────────────────────────┐
│  ✓ Schedule Accepted — Jun 1, 2026 9:17 AM       │
│  (or: ⚠ Changes Requested — ...)                │
│  (or: ✗ Schedule Rejected — ...)                 │
│                                                  │
│  [Change Response]  (reveals buttons again)      │
└─────────────────────────────────────────────────┘
```

### API calls needed from ScheduleViewPage

New: `POST /api/schedule/view/:token/open?weekStart=...`
New: `GET /api/schedule/view/:token/notification?weekStart=...` — returns the most recent notification for this employee+week (status, message, response)
Existing: `PUT /api/schedule/respond/:confirmationToken` — already works

The new GET endpoint returns the `confirmationToken` so the frontend can call the existing respond endpoint.

## Frontend Changes — Admin Side (`ScheduleDelivery`)

### Enhanced Table

Replace the current 5-column table with:

| Select | Employee | Contact | Shifts | Sent | Opened | Response | Actions |
|--------|----------|---------|--------|------|--------|----------|---------|
| ☐ | Alea | alea@... | 5 | Jun 1 9:00 AM | Jun 1 9:15 AM | Accepted | [Resend] |
| ☐ | Alejandra | alejandra@... | 3 | Jun 1 9:00 AM | — | — | [Resend] |

Column details:
- **Select**: Checkbox for bulk operations
- **Contact**: Show email (truncated) or phone, with tooltip for full
- **Sent**: Timestamp of most recent send, or "—" if never sent
- **Opened**: Timestamp of first open after most recent send, or "—"
- **Response**: Badge (Accepted/Rejected/Changes Requested) + timestamp tooltip
- **Actions**: "Resend" button (replaces current "Send Schedule")

### Bulk Send Controls

Above the table, add a toolbar row:

```
[☐ Select All]  [Send Selected (3)]  [Send All]     [search field]
```

- "Send Selected" enabled when 1+ employees checked
- "Send All" selects all employees with contact info
- Both open a confirmation modal

### Send Modal (Bulk)

```
┌─────────────────────────────────────────────────────┐
│  Send Schedule to 3 employees                        │
│                                                      │
│  Week of 6/1 – 6/7                                   │
│                                                      │
│  Message (optional):                                 │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Please review your weekend shifts carefully.    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Recipients:                                         │
│  • Alea (email)                                      │
│  • Alejandra (email)                                 │
│  • Maria (SMS)                                       │
│                                                      │
│                        [Cancel]  [Send Schedules]    │
└─────────────────────────────────────────────────────┘
```

### Status Loading

On component mount (and after sends), call `getNotificationStatus(weekStart)` to populate the Sent/Opened/Response columns. The existing `getScheduleResponses` call can be merged into this single endpoint.

## Email Template Enhancement

When admin includes a custom message, add it to the HTML email:

```html
<!-- After greeting, before schedule table -->
<div style="background: #f0f7ff; border-left: 3px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
  <p style="margin: 0; font-size: 14px; color: #1e3a5f;">
    Message from your scheduler:
  </p>
  <p style="margin: 8px 0 0; font-size: 14px; color: #374151;">
    {message}
  </p>
</div>
```

For SMS, append after the shift summary:
```
Note from scheduler: {message}
```

## Security Considerations

- Open tracking endpoint is public (matches the public schedule view page) — no auth needed since it requires a valid schedule link token
- The endpoint only updates `openedAt` on existing notifications; it cannot create records or modify other fields
- Rate limiting: standard Express rate limiter already applies to all routes
- The `confirmationToken` on notifications is a UUID — not guessable

## Edge Cases

1. **Employee views schedule before any notification was sent**: Open tracking is a no-op (no notification to mark)
2. **Admin resends**: Creates a new notification record. Previous one retains its history. The status table shows the most recent send's state.
3. **Employee responds then admin resends**: New notification starts fresh (no response). Old response remains in history. The admin table shows the latest state.
4. **Employee changes response**: Allowed via "Change Response" button. Updates the same notification record.
5. **Multiple send methods (email + SMS)**: Both create separate notification records. The admin table shows the most recent across both methods for each employee.

## File Changes Summary

| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add `openedAt`, `message`, `sentById` to ScheduleNotification; add relation on User |
| `server/src/controllers/scheduleNotificationController.js` | Modify `sendSchedules` (message, sentBy); add `recordOpen`; modify `getNotificationStatus` (richer data); add `getNotificationForView` |
| `server/src/controllers/employeeScheduleLinkController.js` | Add `recordOpen` handler |
| `server/src/services/notificationService.js` | Add message block to `formatScheduleEmailHtml` and `formatScheduleSms` |
| `server/src/routes/api.js` | Add `POST /schedule/view/:token/open`, `GET /schedule/view/:token/notification` |
| `client/src/api.js` | Add `recordScheduleOpen`, `getScheduleNotification` |
| `client/src/pages/scheduling/ScheduleViewPage.jsx` | Add open tracking call + acknowledgement section |
| `client/src/pages/scheduling/ScheduleDelivery.jsx` | Add checkboxes, bulk send, enhanced columns, send modal with message |

## Out of Scope

- Push notifications (beyond email/SMS)
- Automatic reminders for employees who haven't acknowledged
- PDF attachment of schedule in email (schedule is already in the HTML)
- Historical log page (all history visible via the per-week status table; a cross-week report can be added later)
