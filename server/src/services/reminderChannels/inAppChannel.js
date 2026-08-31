const { createNotification } = require('../complianceService');

async function send(employee, stage, msg) {
  try {
    await createNotification(employee.id, stage, msg.title, msg.body);
    return 'sent';
  } catch (err) {
    console.error(`[CertReminder] in-app failed for employee ${employee.id}:`, err.message);
    return 'failed';
  }
}

module.exports = { send };
