const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('../services/notificationService');

async function sendTaskReminders() {
    if (!isEmailConfigured()) {
        console.log('[TaskReminders] Email not configured, skipping.');
        return { sent: 0, skipped: 0 };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowEnd = new Date(todayStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

    const todayStr = todayStart.toISOString().split('T')[0];

    const tasks = await prisma.task.findMany({
        where: {
            status: { in: ['open', 'in_progress'] },
            dueDate: { gte: todayStart, lt: tomorrowEnd },
        },
        include: {
            assignedToUser: { select: { id: true, name: true, email: true } },
            reminders: {
                where: { sentAt: { gte: todayStart } },
            },
        },
    });

    let sent = 0;
    let skipped = 0;

    for (const task of tasks) {
        if (task.reminders.length > 0) {
            skipped++;
            continue;
        }

        let recipients = [];
        if (task.assignedToUser?.email) {
            recipients.push(task.assignedToUser.email);
        } else if (task.assignedToRole) {
            const users = await prisma.user.findMany({
                where: { role: task.assignedToRole, active: true, archivedAt: null },
                select: { email: true },
            });
            recipients = users.map((u) => u.email).filter(Boolean);
        }

        if (recipients.length === 0) {
            skipped++;
            continue;
        }

        const urgencyLabel = task.urgency.charAt(0).toUpperCase() + task.urgency.slice(1);
        const dueLabel = task.dueDate.toISOString().split('T')[0] === todayStr ? 'today' : 'tomorrow';
        const appUrl = process.env.APP_URL || 'https://nvbestpca.com';

        const subject = `Task Reminder: "${task.title}" is due ${dueLabel}`;
        const html = `
            <p>You have a task due <strong>${dueLabel}</strong>:</p>
            <p><strong>${task.title}</strong></p>
            <p>Urgency: ${urgencyLabel}<br>Due: ${task.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            ${task.description ? `<p>${task.description}</p>` : ''}
            <p><a href="${appUrl}/tasks">View Tasks</a></p>
            <p>— NV Best PCA</p>
        `;

        for (const email of recipients) {
            try {
                await sendEmail(email, subject, html);
                await prisma.taskReminder.create({
                    data: { taskId: task.id, channel: 'email', status: 'sent' },
                });
                sent++;
            } catch (err) {
                console.error(`[TaskReminders] Failed to send to ${email}:`, err.message);
                await prisma.taskReminder.create({
                    data: { taskId: task.id, channel: 'email', status: 'failed' },
                });
                skipped++;
            }
        }
    }

    console.log(`[TaskReminders] Done. Sent: ${sent}, Skipped: ${skipped}`);
    return { sent, skipped };
}

module.exports = { sendTaskReminders };
