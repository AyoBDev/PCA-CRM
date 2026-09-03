const { sendEmail, isEmailConfigured } = require('../notificationService');

// Kill switch for certification reminder EMAILS only (in-app notifications,
// compliance blocks, and the exactly-once ledger keep working). Set
// CERT_REMINDER_EMAIL_ENABLED=false to stop sending — e.g. to spare the email
// provider's daily quota — then remove it (or set true) to resume. Checked at
// send time so a restart isn't required beyond reloading env.
function emailRemindersEnabled() {
  return String(process.env.CERT_REMINDER_EMAIL_ENABLED).toLowerCase() !== 'false';
}

async function send(employee, msg) {
  if (!emailRemindersEnabled()) return 'skipped';
  if (!isEmailConfigured() || !employee.email) return 'skipped';
  try {
    await sendEmail(employee.email, msg.subject, msg.html, msg.text);
    return 'sent';
  } catch (err) {
    console.error(`[CertReminder] email failed for employee ${employee.id}:`, err.message);
    return 'failed';
  }
}

module.exports = { send };
