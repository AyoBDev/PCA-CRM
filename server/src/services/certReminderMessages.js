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

module.exports = { buildMessage };
