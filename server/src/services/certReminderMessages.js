function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const STAGES = {
  reminder_30day: (name, cert, date) => ({
    title: `${cert} expiring soon`,
    body: `${name}, your ${cert} expires on ${date}. Renewal and certificate upload are required within 30 days.`,
    subject: `Action needed: your ${cert} expires in 30 days`,
  }),
  reminder_7day: (name, cert, date) => ({
    title: `${cert} expires in one week`,
    body: `${name}, only one week remains — please renew and upload your ${cert} certificate immediately. It expires on ${date}.`,
    subject: `Urgent: your ${cert} expires in 7 days`,
  }),
  expired_final: (name, cert, date) => ({
    title: `${cert} has expired`,
    body: `${name}, your ${cert} has expired today (${date}). Upload your renewal now. Until HR approves your renewed certificate you may be marked Compliance Blocked.`,
    subject: `Expired: your ${cert} requires immediate renewal`,
  }),
};

function buildMessage(stage, { name, certLabel, expDate }) {
  const make = STAGES[stage];
  if (!make) throw new Error(`Unknown reminder stage: ${stage}`);
  const date = fmtDate(expDate);
  const { title, body, subject } = make(name, certLabel, date);
  const html = `<p>${body}</p>`;
  return { subject, html, text: body, title, body };
}

const STAGE_URGENCY = { expired_final: 0, reminder_7day: 1, reminder_30day: 2 };

function lineFor(item) {
  const date = fmtDate(item.expDate);
  if (item.stage === 'expired_final') return `${item.certLabel} — expired on ${date} (action required now)`;
  if (item.stage === 'reminder_7day') return `${item.certLabel} — expires in 7 days (${date})`;
  if (item.stage === 'reminder_30day') return `${item.certLabel} — expires in 30 days (${date})`;
  throw new Error(`Unknown reminder stage: ${item.stage}`);
}

function buildBatchMessage(name, items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('buildBatchMessage requires at least one item');

  // Single-item batch delegates to the single-cert builder so wording is identical.
  if (items.length === 1) {
    return buildMessage(items[0].stage, { name, certLabel: items[0].certLabel, expDate: items[0].expDate });
  }

  const sorted = [...items].sort((a, b) => STAGE_URGENCY[a.stage] - STAGE_URGENCY[b.stage]);
  const lines = sorted.map(lineFor); // throws on unknown stage
  const expiredCount = items.filter(i => i.stage === 'expired_final').length;
  const expiringCount = items.length - expiredCount;

  const parts = [];
  if (expiredCount) parts.push(`${expiredCount} expired`);
  if (expiringCount) parts.push(`${expiringCount} expiring`);
  const subject = `Action required: ${parts.join(' and ')} certification${items.length > 1 ? 's' : ''}`;
  const title = `${items.length} certifications need attention`;

  const bodyLines = [
    `${name}, the following certifications need your attention:`,
    ...lines.map(l => `• ${l}`),
    `Please renew and upload the certificate(s) above.`,
  ];
  if (expiredCount > 0) {
    bodyLines.push(`Until HR approves your renewed certificate(s) you may be marked Compliance Blocked.`);
  }
  const body = bodyLines.join('\n');
  const html = `<p>${bodyLines.join('<br>')}</p>`;
  return { subject, html, text: body, title, body };
}

module.exports = { buildMessage, buildBatchMessage };
