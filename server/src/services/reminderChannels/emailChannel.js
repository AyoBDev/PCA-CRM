const { sendEmail, isEmailConfigured } = require('../notificationService');

async function send(employee, msg) {
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
