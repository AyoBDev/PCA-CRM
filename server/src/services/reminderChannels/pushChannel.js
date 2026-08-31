// Push stub. The employee app + web-push (VAPID) are not built yet; this records
// intent and returns 'stubbed'. When push lands, only this function's body
// changes — its signature and every caller stay the same.
async function send(employee, msg) {
  console.log(`[CertReminder] push (stub) for employee ${employee.id}: ${msg.title}`);
  return 'stubbed';
}

module.exports = { send };
