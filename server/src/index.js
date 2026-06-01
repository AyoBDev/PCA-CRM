require('dotenv').config();
const app = require('./app');
const cron = require('node-cron');
const { sendOverdueReminders } = require('./jobs/timesheetReminders');

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
});
