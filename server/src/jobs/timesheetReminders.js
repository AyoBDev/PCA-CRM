const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('../services/notificationService');
const { isOverdue } = require('../lib/timesheetUtils');

async function sendOverdueReminders() {
    if (!isEmailConfigured()) {
        console.log('[TimesheetReminders] Email not configured, skipping.');
        return { sent: 0, skipped: 0 };
    }

    const overdueTimesheets = await prisma.timesheet.findMany({
        where: {
            status: 'draft',
            archivedAt: null,
            reminders: { none: {} },
        },
        include: {
            client: true,
        },
    });

    const actuallyOverdue = overdueTimesheets.filter(isOverdue);

    let sent = 0;
    let skipped = 0;

    for (const ts of actuallyOverdue) {
        const permanentLink = await prisma.permanentLink.findFirst({
            where: { clientId: ts.clientId, pcaName: ts.pcaName },
        });

        const employee = await prisma.employee.findFirst({
            where: { name: ts.pcaName },
            include: { user: true },
        });

        const email = employee?.user?.email || employee?.email;
        if (!email) {
            console.log(`[TimesheetReminders] No email for PCA "${ts.pcaName}", skipping timesheet ${ts.id}`);
            skipped++;
            continue;
        }

        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const weekRange = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;

        const formLink = permanentLink
            ? `${process.env.APP_URL || 'https://nvbestpca.com'}/pca-form/${permanentLink.token}`
            : '';

        const subject = `Timesheet Reminder: Week of ${weekRange} not submitted`;
        const html = `
            <p>Hi ${ts.pcaName},</p>
            <p>Your timesheet for <strong>${ts.client.clientName}</strong> for the week of <strong>${weekRange}</strong> has not been submitted.</p>
            <p>Please submit it as soon as possible to avoid payroll delays.</p>
            ${formLink ? `<p><a href="${formLink}">Click here to open your timesheet</a></p>` : ''}
            <p>Thank you,<br>NV Best PCA</p>
        `;

        try {
            await sendEmail(email, subject, html);
            await prisma.timesheetReminder.create({
                data: {
                    timesheetId: ts.id,
                    employeeId: employee?.id || null,
                    channel: 'email',
                    status: 'sent',
                },
            });
            sent++;
            console.log(`[TimesheetReminders] Sent reminder for timesheet ${ts.id} to ${email}`);
        } catch (err) {
            console.error(`[TimesheetReminders] Failed to send to ${email}:`, err.message);
            await prisma.timesheetReminder.create({
                data: {
                    timesheetId: ts.id,
                    employeeId: employee?.id || null,
                    channel: 'email',
                    status: 'failed',
                },
            });
            skipped++;
        }
    }

    console.log(`[TimesheetReminders] Done. Sent: ${sent}, Skipped: ${skipped}`);
    return { sent, skipped };
}

module.exports = { sendOverdueReminders };
