# Operations docs

Operational and security-review reference for the PCA CRM.

| Doc | Answers |
|-----|---------|
| [data-isolation.md](data-isolation.md) | "How is our data separated from your other customers' data?" — the multi-tenant RLS design. |
| [incident-response.md](incident-response.md) | "What happens when it breaks — and how would you even know?" — who's notified, what's checked, how customers hear about it. |
| [monitoring.md](monitoring.md) | "How would you even know?" — the availability (UptimeRobot on `/health`), error (Sentry), and platform (Railway) signals. |
| [backup-restore.md](backup-restore.md) | "Backups run automatically — and restore has been tested." — what backups exist, how to restore, and the round-trip test that proves it. |
| [incidents/](incidents/) | Post-incident writeups, one file per SEV-1/SEV-2 incident. |

These target the questions in a customer's vendor-security questionnaire. Keep them
current as the system changes.
