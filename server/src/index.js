require('dotenv').config();
// Initialize Sentry BEFORE requiring the app or other modules so its
// auto-instrumentation can hook the HTTP layer. No-op unless SENTRY_DSN is set.
const observability = require('./lib/observability');
observability.initObservability();
const { validateEnv } = require('./lib/validateEnv');
validateEnv(); // fail fast if security-critical env vars are missing/malformed
const http = require('http');
const app = require('./app');
const cron = require('node-cron');
const { initSocket } = require('./socket');
const { sendOverdueReminders } = require('./jobs/timesheetReminders');
const { runTaskTriggers } = require('./jobs/taskTriggers');
const { sendTaskReminders } = require('./jobs/taskReminders');
const { runCertReminderSweep } = require('./jobs/certReminderCron');
const { runLeadDormancySweep } = require('./jobs/leadDormancySweep');
const { runAuditLogRetention } = require('./jobs/auditLogRetention');
const { startWorker } = require('./workers/replacementWorker');

if (process.env.NODE_ENV === 'production' && !process.env.APP_DATABASE_URL) {
    throw new Error('APP_DATABASE_URL must be set in production — tenant isolation depends on the RLS-constrained app_user connection');
}

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => {
    console.log(`Auth Tracking API running on http://localhost:${PORT}`);

    cron.schedule('0 6 * * 0', async () => {
        console.log('[Cron] Running overdue timesheet reminders...');
        try {
            await sendOverdueReminders();
        } catch (err) {
            console.error('[Cron] Reminder job failed:', err);
            observability.captureError(err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: overdue timesheet reminders (Sunday 6:00 AM UTC)');

    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Running task triggers...');
        try {
            await runTaskTriggers();
        } catch (err) {
            console.error('[Cron] Task triggers job failed:', err);
            observability.captureError(err);
        }
    }, { timezone: 'UTC' });

    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running task reminders...');
        try {
            await sendTaskReminders();
        } catch (err) {
            console.error('[Cron] Task reminders job failed:', err);
            observability.captureError(err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: task triggers (hourly)');
    console.log('[Cron] Scheduled: task reminders (daily 8:00 AM UTC)');

    cron.schedule('0 6 * * *', async () => {
        console.log('[Cron] Running certification reminder + compliance sweep...');
        try {
            await runCertReminderSweep();
        } catch (err) {
            console.error('[Cron] Compliance check failed:', err);
            observability.captureError(err);
        }
    }, { timezone: 'America/Los_Angeles' });

    console.log('[Cron] Scheduled: certification reminder + compliance sweep (daily 6:00 AM PT)');

    cron.schedule('0 3 * * *', async () => {
        console.log('[Cron] Running lead dormancy sweep...');
        try {
            await runLeadDormancySweep();
        } catch (err) {
            console.error('[Cron] Lead dormancy sweep failed:', err);
            observability.captureError(err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: lead dormancy sweep (daily 3:00 AM UTC)');

    cron.schedule('0 4 * * *', async () => {
        console.log('[Cron] Running audit-log retention...');
        try {
            await runAuditLogRetention();
        } catch (err) {
            console.error('[Cron] Audit-log retention failed:', err);
            observability.captureError(err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: audit-log retention (daily 4:00 AM UTC; no-op unless AUDIT_LOG_RETENTION_DAYS is set)');

    // Start the BullMQ worker that expires unanswered offers and escalates the
    // replacement loop. No-ops when REDIS_URL is unset, so this is safe to call
    // unconditionally; without it, offer-expiry jobs would be queued but never
    // processed, so offers would never auto-advance.
    startWorker();
    console.log('[Worker] Replacement offer-expiry worker started (or skipped if REDIS_URL unset)');
});
