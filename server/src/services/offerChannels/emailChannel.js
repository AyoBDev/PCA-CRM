// Email offer channel — Brevo, via the existing notificationService.
//
// Styled to match formatScheduleEmailHtml so a replacement offer looks like the
// schedule emails caregivers already receive.

const notifications = require('../notificationService');
const { formatShiftLine, hhmm12, offerUrl } = require('./format');

const name = 'email';

function isConfigured() {
    return notifications.isEmailConfigured();
}

function buildHtml(offer, context) {
    const { employee, client, shift } = context;
    const url = offerUrl(offer);
    const expiryNote = offer.expiresAt
        ? `<p style="margin:12px 0 0;color:#71717a;font-size:13px">This offer expires at ${hhmm12(offer.expiresAt)}. After that it may be given to someone else.</p>`
        : '';

    return `
        <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#09090b">
            <h2 style="margin:0 0 4px;font-size:20px">A shift is available</h2>
            <p style="margin:0 0 16px;color:#71717a;font-size:14px">Hi ${employee.name},</p>
            <p style="margin:0 0 16px;font-size:14px">A shift needs coverage and you're a good match for it:</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7;font-size:14px">
                <tr><td style="padding:10px 16px;color:#71717a;border-bottom:1px solid #e4e4e7">Client</td><td style="padding:10px 16px;font-weight:500;border-bottom:1px solid #e4e4e7">${client.clientName}</td></tr>
                <tr><td style="padding:10px 16px;color:#71717a;border-bottom:1px solid #e4e4e7">When</td><td style="padding:10px 16px;font-weight:500;border-bottom:1px solid #e4e4e7">${formatShiftLine(shift)}</td></tr>
                <tr><td style="padding:10px 16px;color:#71717a;border-bottom:1px solid #e4e4e7">Service</td><td style="padding:10px 16px;border-bottom:1px solid #e4e4e7">${shift.serviceCode}</td></tr>
                <tr><td style="padding:10px 16px;color:#71717a">Address</td><td style="padding:10px 16px">${client.address || '—'}</td></tr>
            </table>
            <p style="margin:20px 0 0;text-align:center">
                <a href="${url}" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px">View &amp; respond</a>
            </p>
            ${expiryNote}
        </div>
    `;
}

function buildText(offer, context) {
    const { client, shift } = context;
    return [
        'A shift is available.',
        `Client: ${client.clientName}`,
        `When: ${formatShiftLine(shift)}`,
        `Service: ${shift.serviceCode}`,
        client.address ? `Address: ${client.address}` : null,
        offer.expiresAt ? `Expires at ${hhmm12(offer.expiresAt)}.` : null,
        '',
        `Respond: ${offerUrl(offer)}`,
    ].filter(Boolean).join('\n');
}

async function send(offer, context) {
    const { employee } = context;
    if (!employee.email) {
        throw new Error(`Employee ${employee.id} has no email address`);
    }

    await notifications.sendEmail(
        employee.email,
        'A shift is available',
        buildHtml(offer, context),
        buildText(offer, context),
    );
}

module.exports = { name, isConfigured, send };
