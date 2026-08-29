# App-Owned Certification Renewal Automation

**Date:** 2026-08-28
**Status:** Approved design — pending implementation plan
**Branch:** `feat/cert-renewal-automation`

## Summary

Build an in-app renewal automation for renewable employee certifications that is
**owned entirely by this app** — with no dependency on Monday.com (the current
temporary system). The app calculates each certification's expiration date and
automatically sends caregivers three staged reminders (email + in-app
notification now; push notification stubbed behind a real channel interface for
when the employee app ships). On final expiration, if HR has not approved the
renewal, the caregiver is set to **Compliance Blocked** and a reusable clock-in
gate is armed. Each certification *version* tracks its own reminders so the same
reminder is never sent twice; HR approval of a renewal archives the old file to
Portfolio History, makes the new file current, and resets the reminder schedule
against the new expiration date.

## Goals

- Three automatic reminder stages per renewable cert: **30 days before**,
  **7 days before**, **final expiration day**.
- Each reminder addresses the caregiver by **name** and names the **certification**.
- Delivery channels: **email** and **in-app notification** (live now), plus
  **push notification** (stubbed today behind the real channel interface; only
  the push channel's body changes when the employee app + web-push land).
- **Exactly-once per certification version per stage** — no duplicate reminders.
- **Compliance block** on final expiration when HR has not approved: set
  `complianceStatus = 'blocked'`, notify the caregiver, and arm a reusable
  `isClockInBlocked(employeeId)` gate. (Per decision below, do **not** reject
  timesheets yet — wire the enforcement point, keep it dormant.)
- **HR approval resets the cycle**: old certificate remains in Portfolio History,
  the new version becomes current, and the reminder schedule resets to the new
  expiration date.
- No Monday.com dependency anywhere in the finished workflow.

## Non-Goals (YAGNI)

- No in-app clock-in/out feature is built here. The app does not currently own a
  time-punch; time comes from imported EVV/payroll data. We only **arm** the
  enforcement gate for the future in-app clock.
- No timesheet rejection for blocked employees yet (deferred by decision).
- No live web-push sending yet (no VAPID wiring, no device subscribes). The push
  channel is a no-op stub with the final method signature.
- No SMS channel.

## Decisions (from brainstorming)

1. **Compliance block scope:** Flag + gate only. Set `complianceStatus='blocked'`
   and expose `isClockInBlocked(employeeId)`; **do not** reject timesheets yet.
   Enforcement point is wired so it becomes automatic when the in-app clock ships.
2. **Reminder tracking:** Per-version sent-ledger (`CertReminderLog` keyed by
   `certificationId` + `versionKey` + `stage`) — not boolean flags. Resetting is a
   consequence of the version key changing, not a column to clear.
3. **Push:** Channel abstraction with push as a no-op stub today.
4. **HR approval / versioning:** Approve = update the cert row in place; prior
   files stay in `CertificationUpload` as Portfolio History; the latest approved
   upload id becomes `currentVersionKey`, which re-arms the stages automatically.

## Existing Infrastructure (reused, not rebuilt)

- `server/src/jobs/complianceCron.js` — per-agency cron that iterates active
  agencies inside `runWithTenant`. The **cert reminder + block logic here is
  superseded** by the unified sweep in this design (its ad-hoc "reminder in the
  last 7 days?" window is replaced by the precise per-version ledger).
- `server/src/services/complianceService.js` — `evaluateCompliance` (sets
  `complianceStatus`), `createComplianceTask`, `createNotification` (writes a
  `Notification` row + emits `notification:new` over the socket),
  `resolveComplianceTasks`. Extended here with `approveCertRenewal` and
  `isClockInBlocked`.
- `server/src/services/notificationService.js` — Brevo `sendEmail(...)`.
- Prisma models: `EmployeeCertification`, `CertificationUpload` (per-version file
  history), `Notification`, `CertType` (`requiresExpiry`, `renewalYears`),
  `Employee.complianceStatus` (`ok`/`blocked`), `PushSubscription` (for future push).
- `server/src/index.js` — existing `node-cron` registrations (compliance job at
  `0 6 * * *`). The new sweep replaces/absorbs the compliance cron entry.
- HR approval surfaces: `PUT /certifications/:id` → `updateCertification`
  (ongoing cert management; **the approval hook**), plus onboarding
  `reviewRequirementItem` for initial onboarding.
- Client-side history rendering already exists (`CertFileRow`,
  `cert-history__list`) — Portfolio History needs no new UI plumbing.

## Architecture

One daily cron drives everything, per agency, inside `runWithTenant`:

```
dailyReminderSweep (per agency)
  └─ for each EmployeeCertification where certType.requiresExpiry && expirationDate set:
       ├─ if not the current version (versionKey !== currentVersionKey) → skip reminders
       ├─ compute daysToExpiry (calendar days)
       ├─ stage = computeStage(daysToExpiry)          // 30-day | 7-day | final | none
       ├─ versionKey = String(currentVersionKey ?? latest approved uploadId ?? 'v0')
       ├─ if stage && no CertReminderLog(certId, versionKey, stage):
       │     └─ deliverReminder(cert, stage, versionKey)  // email + in-app + push-stub, then log
       └─ if stage === 'final' && not HR-approved for this cycle:
             └─ evaluateCompliance(employeeId)  // → complianceStatus='blocked' + blocked notification
```

**Idempotency is the core guarantee.** The sweep is safe to run any number of
times per day: the ledger (plus a DB unique constraint) makes each
(cert version, stage) send exactly once. Missed days are tolerated by a range
check (`≤N and unseen`), so a stage is never *skipped* if the cron misses a run.

The whole per-agency sweep is wrapped in try/catch so one tenant's failure does
not abort the others (matching existing cron style).

## Data Model Changes

All additive (new table + nullable columns) — `main` will not break. Follow
existing multi-tenant conventions: `agencyId` FK + `@@index([agencyId])`,
snake_case `@@map`.

### New model: `CertReminderLog` (the per-version sent-ledger)

```prisma
model CertReminderLog {
  id              Int      @id @default(autoincrement())
  certificationId Int      @map("certification_id")
  versionKey      String   @map("version_key")   // approved uploadId (or "v{n}") this reminder belongs to
  stage           String                          // 'reminder_30day' | 'reminder_7day' | 'expired_final'
  channels        Json                            // { email:'sent'|'failed'|'skipped', inApp:'sent', push:'stubbed' }
  sentAt          DateTime @default(now()) @map("sent_at")
  certification   EmployeeCertification @relation(fields: [certificationId], references: [id], onDelete: Cascade)
  agencyId        Int      @map("agency_id")
  agency          Agency   @relation(fields: [agencyId], references: [id], onDelete: Cascade)

  @@unique([certificationId, versionKey, stage])   // DB-enforced exactly-once per version+stage
  @@index([agencyId])
  @@map("cert_reminder_logs")
}
```

The `@@unique` is a hard backstop: a double-fire throws `P2002`, caught and
treated as "already sent." When HR approves a new version, `versionKey` changes,
so all three stages read as unseen for the new version → schedule resets with no
reset column to clear.

### `EmployeeCertification` — new fields

```prisma
currentVersionKey  String?   @map("current_version_key")  // which uploadId is the approved/current file
approvedAt         DateTime? @map("approved_at")
approvedById       Int?      @map("approved_by_id")
approvedByName     String    @default("") @map("approved_by_name")
reminders          CertReminderLog[]
```

Existing `status` carries `pending`/`approved`/`active`. Treat `approved`/`active`
as "current & counting down," `pending` as "awaiting HR." Old files are never
deleted — they remain rows in `CertificationUpload` (Portfolio History).

### `Employee`

No change — `complianceStatus` (`ok`/`blocked`) already exists.

### `Agency`

Add the `certReminderLogs CertReminderLog[]` back-relation.

## The Three Stages & Delivery Fan-Out

A single `deliverReminder(cert, stage, versionKey)` owns all messaging; the
stages differ only in copy and side-effects. It fans out to failure-isolated
channels (one channel failing never blocks another or the block logic):

```
deliverReminder(cert, stage, versionKey):
  msg = buildMessage(stage, employee.name, certLabel, expirationDate)
  results = {}
  results.email = await emailChannel.send(employee, msg)   // Brevo, now
  results.inApp = await inAppChannel.send(employee, stage, msg) // Notification row + socket emit
  results.push  = await pushChannel.send(employee, msg)    // STUB: logs, returns 'stubbed'
  writeReminderLog(cert.id, versionKey, stage, results)
```

The **push channel is a no-op stub** with the exact `send(employee, msg)`
signature the real web-push sender will have. When the employee app + VAPID keys
land, only `pushChannel.send`'s body changes — automation, stages, and ledger are
untouched.

| Stage | Fires when | Message (name + cert name) | Side effect |
|---|---|---|---|
| **30-day** (`reminder_30day`) | `daysToExpiry ≤ 30 && > 7` and unseen | "{name}, your {cert} expires on {date}. Renewal and certificate upload are required within 30 days." | — |
| **7-day** (`reminder_7day`) | `daysToExpiry ≤ 7 && > 0` and unseen | "{name}, only one week remains — please renew and upload your {cert} certificate immediately." | — |
| **Final** (`expired_final`) | `daysToExpiry ≤ 0` and unseen | "{name}, your {cert} has expired today. Upload your renewal now." | If not HR-approved by end of day → `complianceStatus='blocked'` + `blocked` notification |

The `≤N and unseen` ranges (rather than strict `=== N`) tolerate missed cron days
and mid-window cert creation: the caregiver still receives each stage exactly
once (ledger prevents re-fire; range prevents skip).

**Message copy** is produced by a pure `buildMessage(stage, name, cert, date)` →
`{ subject, html, text, title, body }` so it is unit-testable without I/O.

## Compliance Block & Clock-In Gate

- **On final stage, not HR-approved:** call `evaluateCompliance(employeeId)`
  (existing) → sets `complianceStatus='blocked'` and creates a `blocked`
  notification (dedup as today).
- **New `isClockInBlocked(employeeId)`** in `complianceService`: returns
  `true` when `complianceStatus === 'blocked'`. This is the single enforcement
  point the future in-app clock (and employee app) will call. **It is armed but
  dormant** — no timesheet path calls it yet (per decision). Documented as the
  hook for when the in-app clock ships.

## HR Approval, Versioning & Schedule Reset

The **approval event** is HR setting a pending cert to `approved`/`active` via
`PUT /certifications/:id` (`updateCertification`), typically with the new
`expirationDate`. Wrap the transition in `approveCertRenewal(cert, newExpiration,
hrUser)` in `complianceService`, run inside `tenantTransaction`:

```
approveCertRenewal(cert, newExpiration, hrUser):
  latestUpload = most recent CertificationUpload for this cert   // the renewed file
  tx:
    ├─ cert.update({ status:'active', expirationDate:newExpiration,
    │                currentVersionKey: String(latestUpload.id),
    │                approvedAt: now, approvedById: hrUser.id, approvedByName: hrUser.name })
    ├─ resolveComplianceTasks(cert.id)      // clears the "Renew X" task (existing)
    └─ evaluateCompliance(employee.id)      // unblocks if this was the last expired cert
  // No CertReminderLog rows written/deleted here. currentVersionKey changed →
  // the sweep sees all 3 stages unseen for the NEW version → schedule resets
  // against newExpiration automatically.
  audit.logAction(... 'UPDATE' 'EmployeeCertification' ... { action: 'cert_renewal_approved' })
```

- **Portfolio History is automatic:** the old file is untouched — still a
  `CertificationUpload` row rendered by the existing history UI. The new upload id
  becomes `currentVersionKey` ("current").
- **Guard:** the sweep reminds/blocks only on the **current** version
  (`versionKey === currentVersionKey`), and treats a cert as HR-approved for the
  cycle when `status ∈ {approved, active}` **and** `approvedAt > previous
  expiration`. Prevents a stale approved state from suppressing new reminders.

## Component Boundaries

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| Reminder channels | `services/reminderChannels/{emailChannel,inAppChannel,pushChannel}.js` | One `send(...)` each; failure-isolated | Brevo sender; `Notification`+socket; (push: stub) |
| Message builder | `services/certReminderMessages.js` | Pure `buildMessage(stage, name, cert, date)` | none (pure) |
| Reminder engine | `services/certReminderService.js` | `deliverReminder`, `computeStage`, `versionKey`, ledger writes | channels, messages, tenant db |
| Compliance | `services/complianceService.js` (extend) | `approveCertRenewal`, `isClockInBlocked`; keep `evaluateCompliance` | tenant db |
| Sweep driver | `jobs/certReminderCron.js` | Per-agency iteration; absorbs current `complianceCron` cert logic | reminder engine, compliance |
| Wiring | `index.js`; `employeeCertController.updateCertification` | Schedule cron; call `approveCertRenewal` on approve-transition | above |

## Error Handling

- Each channel is wrapped: a failure records `'failed'` in the ledger `channels`
  JSON and continues. Email down never blocks in-app or the block logic.
- **Stage completion signal (as implemented):** the ledger row is written
  unconditionally after the fan-out completes, which marks the stage done. Every
  channel's result (`'sent'`/`'failed'`/`'skipped'`/`'stubbed'`) is recorded in the
  `channels` JSON for observability, but **no channel gates completion** — not even
  in-app. A stage therefore fires exactly once and is **never retried** on a later
  sweep, regardless of which channels succeeded (a failed email or a failed in-app
  write is logged in `channels`, not re-sent). This keeps "exactly-once" unambiguous
  and matches the DB `@@unique` backstop. Per-channel retry is explicitly out of
  scope for v1. (An earlier draft gated completion on in-app success; the shipped
  engine writes the ledger row regardless, which is the stronger exactly-once
  guarantee.)
- `@@unique([certificationId, versionKey, stage])` throws `P2002` on a duplicate
  attempt; the engine catches it as "already sent."
- Per-agency sweep is try/caught; one tenant error does not abort the rest.

## Testing (TDD — backend built test-first)

Unit:
- `computeStage`: 30 / 7 / final boundaries; missed-day fallback (`≤N` ranges);
  certs with no expiry or non-`requiresExpiry` type skipped.
- `versionKey` / reset: approving a renewal re-arms all three stages for the new
  version.
- Exactly-once: a second sweep the same day sends nothing (ledger + `P2002`).
- `approveCertRenewal`: old file stays in history, new is `currentVersionKey`,
  block clears via `evaluateCompliance`.
- `isClockInBlocked`: true iff `complianceStatus==='blocked'`.
- `buildMessage`: includes employee name + cert label + date per stage.

Integration (Postgres harness):
- Full sweep against a seeded expiring cert writes ledger rows + a `Notification`,
  and on final sets `complianceStatus='blocked'`.

## Audit & History

- Every reminder send logs an audit entry (`entityType: 'EmployeeCertification'`,
  metadata `{ stage }`).
- Approval logs `{ action: 'cert_renewal_approved' }`; block reuses existing
  logging. No new `entityType` (so `HistoryPage.ENTITY_TYPES` is unchanged).

## Rollout Notes

- Additive migration (new table + nullable columns) — safe on `main`.
- Backfill `currentVersionKey` for existing certs: set to the latest
  `CertificationUpload.id` (or `null`) via the migration/seed so the first sweep
  keys correctly and does not re-notify already-handled certs. For certs already
  past expiry at rollout, seed a `CertReminderLog` for the stages that would
  otherwise fire retroactively (avoid a burst of stale reminders on first run).
- Brevo (`BREVO_API_KEY`) must be configured for email to actually send; absent
  it, the email channel records `'skipped'` and in-app still fires.
