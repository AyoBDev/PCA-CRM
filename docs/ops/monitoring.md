# Monitoring & Alerting

**Scope:** how we find out the PCA CRM is unhealthy before a customer does.
Answers the security-review question: *"Monitoring and alerting exist — you find
out from your dashboard, not from the customer's CTO."*

There are two independent signals: **availability** (is the site up?) and
**errors** (is it throwing?). Neither alone is sufficient.

---

## 1. Availability — external uptime monitor

An external monitor (**UptimeRobot**) polls the app from outside Railway, so it
catches a total outage even when the app can't report on itself.

| Setting | Value |
|---------|-------|
| Monitor URL | `https://careomnios.com/health` |
| Expected response | `200` with body `{"status":"ok"}` |
| Alert channel | Email → on-call engineer / maintainer |

**Why `/health` and not `/`:** `GET /health` is a purpose-built liveness endpoint
(`server/src/app.js`) — a tiny JSON response, faster and unambiguous, versus the
root URL which serves the full React app shell (heavier, and could still render
from cache while the API is broken).

**What `/health` does and does not tell you:** it is a **liveness** check — it
confirms the Express process is up and serving. It intentionally does **not**
query the database (so it can't flap on a transient DB blip). A
database-down-but-app-up condition therefore shows *green* here; that class of
failure surfaces through **errors** (Sentry) and Railway logs instead. This split
is deliberate — see the decision in `DECISIONS.md`.

**Recommended monitor config:** HTTP(s) keyword monitor, keyword `"ok"`, check
interval 1–5 min, alert after 1–2 consecutive failures to avoid single-blip noise.

## 2. Errors — Sentry

Unhandled 5xx errors and caught background-job failures are captured, grouped,
and alertable via Sentry (`SENTRY_DSN` set on the Railway service; see
`server/src/lib/observability.js`). Configure a Sentry **alert rule** to email the
on-call engineer on a new issue or an error spike.

Sentry is the signal for "the app is up but misbehaving" — including DB errors,
which the liveness check above does not catch.

## 3. Platform — Railway

Railway service logs and deploy history are the third source: use them to
correlate an incident with a recent deploy (rollback lives here) and to read API
logs around the incident window.

## 4. When an alert fires

Follow `incident-response.md` — it covers triage (availability vs errors), who is
notified, stopping the bleeding, verification, and customer communication.
