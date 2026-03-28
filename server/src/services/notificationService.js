// Notification delivery service
// Twilio and email integrations are optional — check env vars before use

function isSmsConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

function isEmailConfigured() {
    return !!(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST);
}

async function sendSms(to, body) {
    if (!isSmsConfigured()) throw new Error('SMS not configured');
    // Twilio integration — require twilio only when needed
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return client.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
    });
}

async function sendEmail(to, subject, html, text) {
    if (!isEmailConfigured()) throw new Error('Email not configured');
    // SendGrid or Nodemailer — conditional require
    if (process.env.SENDGRID_API_KEY) {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        return sgMail.send({
            to,
            from: process.env.EMAIL_FROM || 'noreply@nvbestpca.com',
            subject,
            html,
            text,
        });
    }
    // Fallback: Nodemailer SMTP
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    return transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@nvbestpca.com',
        to,
        subject,
        html,
        text,
    });
}

function formatScheduleSms(employeeName, shifts, weekLabel, confirmUrl) {
    let msg = `NV Best PCA - Schedule for ${weekLabel}:\n`;
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayAbbr[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        const startH = Number(shift.startTime.split(':')[0]) % 12 || 12;
        const startM = shift.startTime.split(':')[1];
        const startP = Number(shift.startTime.split(':')[0]) >= 12 ? 'pm' : 'am';
        const endH = Number(shift.endTime.split(':')[0]) % 12 || 12;
        const endM = shift.endTime.split(':')[1];
        const endP = Number(shift.endTime.split(':')[0]) >= 12 ? 'pm' : 'am';
        msg += `[${day} ${date}] ${startH}:${startM}${startP}-${endH}:${endM}${endP} - ${shift.client.clientName} (${shift.serviceCode})\n`;
        const details = [];
        if (shift.client.address) details.push(`📍 ${shift.client.address}`);
        if (shift.client.phone) details.push(`📞 ${shift.client.phone}`);
        if (shift.client.gateCode) details.push(`🔑 Gate: ${shift.client.gateCode}`);
        if (shift.client.notes) details.push(`📝 ${shift.client.notes}`);
        if (shift.accountNumber) details.push(`Account: ${shift.accountNumber}`);
        if (shift.sandataClientId) details.push(`Client ID: ${shift.sandataClientId}`);
        if (details.length > 0) msg += details.join(' | ') + '\n';
    }
    msg += `\nConfirm: ${confirmUrl}`;
    return msg;
}

function formatScheduleEmailHtml(employeeName, shifts, weekLabel, confirmUrl) {
    let rows = '';
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayNames[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
        rows += `<tr>
            <td>${day} ${date}</td>
            <td>${shift.startTime} - ${shift.endTime}</td>
            <td>${shift.client.clientName}</td>
            <td>${shift.client.address || ''}</td>
            <td>${shift.client.phone || ''}</td>
            <td>${shift.client.gateCode || ''}</td>
            <td>${shift.client.notes || ''}</td>
            <td>${shift.serviceCode}</td>
            <td>${shift.accountNumber || ''}</td>
            <td>${shift.sandataClientId || ''}</td>
        </tr>`;
    }
    return `
        <h2>Schedule for ${weekLabel}</h2>
        <p>Hi ${employeeName},</p>
        <table border="1" cellpadding="6" cellspacing="0">
            <tr><th>Day</th><th>Time</th><th>Client</th><th>Address</th><th>Phone</th><th>Gate Code</th><th>Notes</th><th>Service</th><th>Account #</th><th>SANDATA ID</th></tr>
            ${rows}
        </table>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">Confirm Receipt</a></p>
    `;
}

module.exports = {
    isSmsConfigured,
    isEmailConfigured,
    sendSms,
    sendEmail,
    formatScheduleSms,
    formatScheduleEmailHtml,
};
