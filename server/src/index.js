require('dotenv').config();
const http = require('http');
const app = require('./app');
const cron = require('node-cron');
const { initSocket } = require('./socket');
const { sendOverdueReminders } = require('./jobs/timesheetReminders');
const { runTaskTriggers } = require('./jobs/taskTriggers');
const { sendTaskReminders } = require('./jobs/taskReminders');
const { runComplianceCheck } = require('./jobs/complianceCron');

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
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: overdue timesheet reminders (Sunday 6:00 AM UTC)');

    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Running task triggers...');
        try {
            await runTaskTriggers();
        } catch (err) {
            console.error('[Cron] Task triggers job failed:', err);
        }
    }, { timezone: 'UTC' });

    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running task reminders...');
        try {
            await sendTaskReminders();
        } catch (err) {
            console.error('[Cron] Task reminders job failed:', err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: task triggers (hourly)');
    console.log('[Cron] Scheduled: task reminders (daily 8:00 AM UTC)');

    cron.schedule('0 6 * * *', async () => {
        console.log('[Cron] Running compliance check...');
        try {
            await runComplianceCheck();
        } catch (err) {
            console.error('[Cron] Compliance check failed:', err);
        }
    }, { timezone: 'America/Los_Angeles' });

    console.log('[Cron] Scheduled: compliance check (daily 6:00 AM PT)');
});
