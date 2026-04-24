// Notification delivery service
// Twilio and email integrations are optional — check env vars before use

function isSmsConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

function isEmailConfigured() {
    return !!process.env.BREVO_API_KEY;
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
    if (!isEmailConfigured()) throw new Error('Email not configured — set BREVO_API_KEY');
    const SibApiV3Sdk = require('sib-api-v3-sdk');
    const client = SibApiV3Sdk.ApiClient.instance;
    client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = {
        name: process.env.EMAIL_FROM_NAME || 'NV Best PCA',
        email: process.env.EMAIL_FROM || 'noreply@nvbestpca.com',
    };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    if (text) sendSmtpEmail.textContent = text;
    return apiInstance.sendTransacEmail(sendSmtpEmail);
}

function hhmm12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatScheduleSms(employeeName, shifts, weekLabel, scheduleUrl) {
    let msg = `NV Best PCA - Schedule for ${weekLabel}:\n`;
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayAbbr[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        msg += `[${day} ${date}] ${hhmm12(shift.startTime)}-${hhmm12(shift.endTime)} - ${shift.client.clientName} (${shift.serviceCode})\n`;
    }
    msg += `\nView full schedule: ${scheduleUrl}`;
    return msg;
}

function formatScheduleEmailHtml(employeeName, shifts, weekLabel, scheduleUrl) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Group shifts by date, only include days with shifts
    const byDate = new Map();
    for (const shift of shifts) {
        const d = shift.shiftDate instanceof Date ? shift.shiftDate.toISOString().split('T')[0] : shift.shiftDate.split('T')[0];
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d).push(shift);
    }

    // Brand colors: primary blue #3b82f6, accent bg #e8f2ff, accent text #1e5faa
    // Foreground #09090b, muted-foreground #71717a, border #e4e4e7
    let rows = '';
    let rowIdx = 0;
    for (const [date, dayShifts] of byDate) {
        const d = new Date(date + 'T12:00:00Z');
        const day = dayNames[d.getUTCDay()];
        const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        for (let i = 0; i < dayShifts.length; i++) {
            const shift = dayShifts[i];
            rows += `<tr>`;
            if (i === 0) {
                rows += `<td rowspan="${dayShifts.length}" style="padding:10px 16px;font-weight:600;color:#09090b;border-bottom:1px solid #e4e4e7;vertical-align:top;white-space:nowrap;border-right:1px solid #e4e4e7">${day}<br><span style="font-weight:400;color:#71717a;font-size:12px">${dateLabel}</span></td>`;
            }
            rows += `<td style="padding:10px 16px;color:#09090b;border-bottom:1px solid #e4e4e7;white-space:nowrap">${hhmm12(shift.startTime)} - ${hhmm12(shift.endTime)}</td>`;
            rows += `<td style="padding:10px 16px;font-weight:500;color:#09090b;border-bottom:1px solid #e4e4e7">${shift.client.clientName}</td>`;
            rows += `<td style="padding:10px 16px;border-bottom:1px solid #e4e4e7"><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#e8f2ff;color:#1e5faa">${shift.serviceCode}</span></td>`;
            rows += `<td style="padding:10px 16px;color:#09090b;border-bottom:1px solid #e4e4e7;font-size:12px">${shift.client.address || '—'}</td>`;
            rows += `<td style="padding:10px 16px;color:#09090b;border-bottom:1px solid #e4e4e7;font-size:12px;white-space:nowrap">${shift.client.phone || '—'}</td>`;
            rows += `<td style="padding:10px 16px;color:#09090b;border-bottom:1px solid #e4e4e7;font-size:12px">${shift.client.gateCode || '—'}</td>`;
            rows += `<td style="padding:10px 16px;color:#09090b;border-bottom:1px solid #e4e4e7;font-size:12px">${shift.notes || shift.client.notes || '—'}</td>`;
            rows += `</tr>`;
        }
        rowIdx++;
    }

    return `
        <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;margin:0 auto;color:#09090b">
            <h2 style="margin:0 0 4px;font-size:20px;color:#09090b">Schedule for ${weekLabel}</h2>
            <p style="margin:0 0 16px;color:#71717a;font-size:14px">Hi ${employeeName},</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7;font-size:13px">
                <tr style="background:rgba(59,130,246,0.04)">
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Day</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Time</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Client</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Service</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Address</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Phone</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Gate Code</th>
                    <th style="padding:10px 16px;color:#71717a;font-weight:600;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e4e4e7">Notes</th>
                </tr>
                ${rows}
            </table>
            <p style="margin:20px 0 0;text-align:center">
                <a href="${scheduleUrl}" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px">View Schedule</a>
            </p>
            <p style="margin:12px 0 0;text-align:center;color:#a1a1aa;font-size:12px">
                Bookmark the link above to always see your latest schedule.
            </p>
        </div>
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
