# Lead Follow-Up Reminders + Contact Log — Design

**Date:** 2026-08-02
**Status:** Approved for implementation planning

## Problem

The agency is receiving a rising volume of leads. Follow-up is tracked manually, so
leads slip: nobody is reminded when a follow-up is due, fresh leads sit untouched,
and leads stall in one pipeline stage without converting. A daily dormancy sweep
already *archives* leads after 90 days of inactivity (`leadDormancySweep.js`), but it
silently hides stale leads instead of warning anyone first. There is also no record of
individual follow-up attempts — the `Lead.callNotes` field is a single overwritable
string, so "called Tuesday, no answer" is lost the moment the next note is typed.

## Goal

Give each person who works leads a **once-per-morning briefing** of the leads that
need attention *today*, scoped to leads they own, and let them **log the outcome of a
follow-up right from that briefing** (and from the lead detail view) — building a real
contact-attempt timeline and scheduling the next touch so live leads stop going stale.

Non-goals: automated outbound email/SMS to leads; changing the pipeline stages;
replacing the dormancy sweep.

## Existing context

- `Lead` model already has `followUpDate`, `assignedTo` (free-text name), `createdBy`
  (free-text name, **currently not set server-side**), `status`, `updatedAt`,
  `dormantAt`, `archivedAt`, `convertedAt`.
- Pipeline stages (`LEAD_STATUSES`): `new`, `review`, `waiting_insurance`,
  `waiting_docs`, `quoted`, `pending_start`, `archived`.
- `DORMANT_DAYS = 90` in `leadService.js`; dormancy sweep archives inactive leads.
- Lead routes gated by `requireRole('admin','user')` + `requirePermission('leads')`.
  "Intake role" in practice = any user with the `leads` permission.
- Clients already have `ClientNote` / `ClientActivity` timeline models to mirror.
- Audit logging + Undo/Redo/History/Activity are mandatory on every mutation
  (see CLAUDE.md).

## Design

The feature has two halves that reinforce each other.

### Half A — Contact log per lead

New model `LeadContact` (mirrors `ClientNote`), giving each lead an append-only
timeline of follow-up attempts instead of one overwritable string.

```
model LeadContact {
  id           Int      @id @default(autoincrement())
  leadId       Int      @map("lead_id")
  outcome      String   @default("")          // see OUTCOMES below
  method       String   @default("call")      // call | text | email | in_person
  note         String   @default("")          // free text
  followUpDate DateTime? @map("follow_up_date")// next scheduled touch (optional)
  createdBy    String   @default("") @map("created_by")
  createdAt    DateTime @default(now()) @map("created_at")
  lead         Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([leadId])
  @@map("lead_contacts")
}
```

`Lead` gains `contacts LeadContact[]`.

**Outcomes** (single source of truth in `leadConstants.js`):

| outcome                 | terminal? | meaning                          |
|-------------------------|-----------|----------------------------------|
| `no_answer`             | no        | Called, no pickup                |
| `left_voicemail`        | no        | Left a voicemail                 |
| `reached_interested`    | no        | Spoke, still interested          |
| `callback_requested`    | no        | Client asked to be called back   |
| `reached_not_interested`| **yes**   | Declined services                |
| `wrong_number`          | **yes**   | Bad contact info                 |
| `went_elsewhere`        | **yes**   | Chose another agency             |
| `other`                 | no        | Anything else (note explains)    |

**Logging a contact does the following, atomically:**
1. Append a `LeadContact` row (nothing overwritten — full history preserved).
2. Enforce the next-follow-up rule: `followUpDate` is **required unless the outcome is
   terminal**. Non-terminal outcome with no date → `400`.
3. If a `followUpDate` was provided, write it back to `Lead.followUpDate`.
4. Bump `Lead.updatedAt` (resets the 90-day dormancy clock — actively worked leads
   stop drifting toward auto-archive).
5. Write an audit entry (`entityType: 'LeadContact'`, `action: 'CREATE'`).

### Half B — Morning reminder briefing

A once-per-morning, dismissable modal shown on the first login of each calendar day to
any user with the `leads` permission, listing leads **relevant to that user**, grouped
into four buckets.

**Relevance (per user).** A non-archived, non-converted lead appears for a user when
`assignedTo` equals their name **or** `createdBy` equals their name. **Admins**
additionally see leads that are unowned (blank `assignedTo` *and* blank `createdBy`),
so nothing falls through the cracks. Name matching is case-insensitive/trimmed.

**Buckets** (thresholds are named constants in `leadService`, next to `DORMANT_DAYS`):

| Bucket             | Rule                                                                                          |
|--------------------|-----------------------------------------------------------------------------------------------|
| Follow-ups due     | `followUpDate` ≤ end of today                                                                  |
| Going stale soon   | last activity between `DORMANT_DAYS - STALE_WARN_DAYS` and `DORMANT_DAYS` days ago (last chance before auto-archive). `STALE_WARN_DAYS = 7` |
| New & untouched    | `status = 'new'`, created > 24h ago, and zero `LeadContact` rows                               |
| Stuck in a stage   | in the same non-terminal stage longer than `STUCK_DAYS` (single threshold, all stages). `STUCK_DAYS = 7`. "Time in stage" = time since last status change (from audit log / `updatedAt` fallback), excluding `new` (covered by its own bucket) and `archived`/converted. |

Each row shows: name, phone, last outcome + when, days-waiting, and two actions —
**Log contact** (opens the Half-A form inline) and **Open** (jumps to the lead). Logging
an outcome with a future next-date makes the row drop off today's list.

Empty state: "You're all caught up 🎉".

## Backend

New/changed, all `requireRole('admin','user')` + `requirePermission('leads')`:

- `POST /api/leads/:id/contacts` — create a contact log entry. Body
  `{ outcome, method, note, followUpDate? }`. Enforces the terminal-vs-next-date rule,
  appends row, conditionally writes `Lead.followUpDate`, bumps `updatedAt`, audits.
- `GET  /api/leads/:id/contacts` — timeline for the detail view (newest first).
- `GET  /api/leads/reminders` — returns the four buckets scoped to `req.user`
  (admins also get unowned). Each item is a slim lead row + `lastContact` summary +
  `daysWaiting` / `daysInStage`.
- `DELETE /api/leads/:id/contacts/:contactId` — supports Undo (removes the row and, if
  it had set `Lead.followUpDate`, the undo handler restores the prior value it captured).

**`createdBy` fix:** `createLead` sets `createdBy: req.user.name` server-side (today it
only reflects whatever the form posts). Legacy leads with blank `createdBy` simply won't
match by creator; assignment matching and the admin unowned-fallback still cover them.

**Constants:** `STALE_WARN_DAYS = 7`, `STUCK_DAYS = 7`, terminal-outcome set — all in
`leadService.js` / `leadConstants.js` as single sources of truth.

**History:** add `'LeadContact'` to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx`.

## Frontend

- `LeadRemindersModal.jsx` — the morning briefing. Four sections with count badges,
  empty state, per-row **Log contact** / **Open** actions.
- `LogContactForm` — compact form (outcome select, method, note, conditional next-date
  picker shown/required when outcome is non-terminal). Reused by the modal **and** the
  `LeadDetailModal`.
- **Contact timeline in the lead view** (`LeadDetailModal.jsx`): a dedicated
  "Follow-up history" section showing every `LeadContact` for the lead, newest first.
  Each entry renders the outcome (as a colored label), method, the note text, who logged
  it (`createdBy`), the relative timestamp, and the next follow-up date it scheduled (if
  any). This is the primary place anyone opens a lead to read the full history of
  follow-up actions across all attempts — "called Tue, no answer" and "called Fri,
  interested" both remain visible instead of overwriting each other. The legacy
  single-string `Lead.callNotes` is shown once, labeled as the original intake note,
  above the timeline. The same `LogContactForm` sits at the top of this section so a new
  follow-up can be logged directly from the lead view.
- **Once-per-morning mechanic:** on app load, if the user has the `leads` permission,
  compare `localStorage('leadRemindersShown')` to today's date; if not shown today and
  `/leads/reminders` has any non-empty bucket, show the modal and stamp today. Dismiss
  also stamps today. Per-device, mirroring the existing `sidebarCollapsed` localStorage
  pattern.
- **Undo/Redo/History/Activity (mandatory per CLAUDE.md):** logging a contact is a
  mutation → `undoState.pushAction('Logged contact for <lead>', undoFn, redoFn)` where
  `undoFn` deletes the contact row and restores the prior `Lead.followUpDate`, and
  `redoFn` re-creates it. The Leads page passes `activityEntity` so the Activity drawer
  shows `LeadContact` entries.

## Testing (backend, test-first)

Mirror `server/__tests__/leadService.test.js`:

- Reminder buckets: each threshold boundary (due today vs tomorrow, stale-window edges,
  new-&-untouched with/without a contact, stuck at exactly `STUCK_DAYS`).
- Per-user scoping: owner-by-assignment, owner-by-creator, admin-sees-unowned,
  non-owner excluded, case-insensitive name match.
- Contact rules: non-terminal outcome without next-date rejected; terminal outcome
  without next-date accepted; `followUpDate` write-back; `updatedAt` bump.

## Rollout notes

- One Prisma migration (add `LeadContact`, add relation).
- No backfill required; legacy `callNotes` is left in place (read-only history) and can
  be surfaced above the new timeline if desired.
- Thresholds are constants now; a future enhancement could move them to the `/services`-
  style settings if the agency wants to tune them without a deploy.
