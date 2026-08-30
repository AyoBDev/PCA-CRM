# Incident Response Plan

**Scope:** production outages, data incidents, and security events for the PCA CRM
(Express API + PostgreSQL, deployed on Railway; React admin + employee apps served
by the same service).

**Owner:** the on-call engineer (currently the primary maintainer). Update the
contacts table below when the team grows.

This is a one-page working plan, not a compliance document. It answers the three
questions a customer's security review asks: **who is notified, what gets checked,
and how customers hear about it.**

---

## 1. Contacts & channels

| Role | Who | Reach via |
|------|-----|-----------|
| On-call engineer (first responder) | Primary maintainer | Email / phone |
| Escalation / decision owner | Agency owner (business) | Phone |
| Customer communications | Agency owner or delegate | Email to affected agency admins |

**Where signals come from:**

- **Errors** — Sentry (`SENTRY_DSN` set on the Railway service). Unhandled 5xx
  errors and caught background-job failures are captured, grouped, and alertable.
  Configure a Sentry alert rule to notify the on-call engineer on a new issue or a
  spike. See `server/src/lib/observability.js`.
- **Availability** — an external UptimeRobot monitor on `https://careomnios.com/health`,
  alerting the on-call engineer by email on downtime. `/health` is a liveness check
  (process up), so a DB-down-but-app-up condition surfaces via Sentry, not here. See
  `monitoring.md`. Sentry sees errors, not a hard-down site.
- **Platform** — Railway service logs and deploy history (rollback lives here).

---

## 2. Severity levels

| Sev | Meaning | Examples | Target response |
|-----|---------|----------|-----------------|
| **SEV-1** | Production down or data at risk | Site unreachable, DB down, suspected breach, PHI exposure, tenant data crossing agencies | Immediate — drop everything |
| **SEV-2** | Major feature broken, no data risk | Payroll import failing, timesheets not saving, one agency's login broken | Same business day |
| **SEV-3** | Degraded / cosmetic | Slow endpoint, non-blocking UI bug | Next working day |

When unsure, treat it as one level higher.

---

## 3. Response steps (SEV-1 / SEV-2)

1. **Acknowledge.** On-call confirms they're on it in the team channel and starts a
   short running log (timestamps + actions). Assign a single incident lead.
2. **Assess scope.** Which agencies/users are affected? Is data at risk, or is this
   availability only? Check:
   - Sentry — the error, its frequency, and which users/roles it hit.
   - Railway logs — for the API service around the incident window.
   - Railway deploy history — did a recent deploy correlate with the start?
3. **Stop the bleeding.**
   - If a recent deploy caused it → **roll back** in Railway to the last known-good
     deploy. Deploys are a repeatable pipeline (`prisma migrate deploy → setup-app-role
     → seed → start`), so rollback is a redeploy, not an SSH session.
   - If it's load/abuse → the auth endpoints are already rate-limited; block or
     throttle the offending source at the platform edge if needed.
   - If data integrity is at risk → **stop writes** to the affected area before
     attempting any fix (see Data incidents below).
4. **Fix or mitigate.** Apply the smallest safe change. Prefer rollback + a proper
   fix over a risky hot-patch.
5. **Verify.** Confirm `GET /health` is green, the failing flow works, and Sentry is
   quiet. Watch for 15–30 min.
6. **Communicate.** See section 5.
7. **Write it up.** Within 48h, a short post-incident note: what happened, root
   cause, timeline, what stops it recurring. Keep these in `docs/ops/incidents/`.

---

## 4. Data incidents (integrity, loss, or exposure)

**Tenant isolation is the highest-priority invariant.** If there's any sign of one
agency's data appearing under another agency, treat it as **SEV-1** and stop writes
immediately. Isolation is enforced by Postgres Row-Level Security keyed on
`agency_id` (see `docs/ops/data-isolation.md`); a suspected leak means either the
tenant connection or a policy is misbehaving.

**Data loss / corruption → restore path:**

- Railway provides automated daily PostgreSQL backups (point-in-time within
  Railway's retention). This is the primary restore source.
- The app also exposes a full schema-driven export: `GET /api/backup/export`
  (admin JWT or the `BACKUP_API_KEY` header). Per-tenant and platform-wide variants
  exist; single-use bearer-token tables are excluded by design. See
  `server/src/controllers/backupController.js`.
- **Restore drill:** restore into a *scratch* database first, verify row counts and
  a few records, then cut over — never restore straight over production. (Track the
  "restore has been tested" checklist item — a restore that's never been exercised
  is a hope, not a plan.)

**Suspected breach / credential exposure:**

- Rotate the affected secret(s) immediately via Railway env vars + restart:
  `JWT_SECRET` (invalidates all sessions), `BACKUP_API_KEY`, DB credentials,
  `ENCRYPTION_KEY`/`INTEGRITY_KEY` (⚠️ rotating `ENCRYPTION_KEY` makes existing
  encrypted PHI unrecoverable — see CLAUDE.md; treat as a last resort with a
  re-encryption plan).
- Bumping a user's `permissionsVersion` invalidates their existing JWTs (see
  `authMiddleware.js`).
- PHI at rest is AES-256-GCM encrypted; note that in any exposure assessment.

---

## 5. Customer communication

- **Who tells them:** the agency owner (or delegate), not the engineer mid-fire.
- **When:** for SEV-1 affecting a customer's data or access, notify affected agency
  admins as soon as scope is understood — don't wait for full resolution.
- **What to say:** what's affected, what you're doing, and the next update time. Be
  factual; don't speculate on cause before it's confirmed.
- **Data incidents:** if PHI may have been exposed, escalate to the business owner
  for any regulatory/notification obligations (this is a Medicaid/PCA context —
  breach-notification rules may apply). Engineering's job is to preserve evidence
  (don't wipe logs) and support the assessment.

---

## 6. After every SEV-1/SEV-2

- [ ] Running log saved to `docs/ops/incidents/YYYY-MM-DD-short-name.md`
- [ ] Root cause identified (not just the symptom)
- [ ] Follow-up work filed to prevent recurrence
- [ ] If a monitoring gap let it run unnoticed, close that gap (alert, health check,
      or Sentry rule)
