require('dotenv').config();
const app = require('./app');
const cron = require('node-cron');
const { sendOverdueReminders } = require('./jobs/timesheetReminders');
const { runTaskTriggers } = require('./jobs/taskTriggers');
const { sendTaskReminders } = require('./jobs/taskReminders');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`🚀 Auth Tracking API running on http://localhost:${PORT}`);

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
});
