// Portal offer channel — delivers a replacement offer as an in-app
// notification in the employee PWA.
//
// Always "configured": it depends on nothing external, which makes it the
// baseline channel that works even when email and SMS are unavailable.

const { createNotification } = require('../complianceService');
const { hhmm12, formatShiftLine } = require('./format');

const name = 'portal';

function isConfigured() {
    return true;
}

async function send(offer, context) {
    const { employee, client, shift } = context;

    const title = 'Shift available';
    const body = `${client.clientName} — ${formatShiftLine(shift)}. `
        + `Open the app to accept${offer.expiresAt ? ` before ${hhmm12(offer.expiresAt)}` : ''}.`;

    // Routed through complianceService.createNotification rather than a direct
    // prisma write so the realtime socket event still fires — otherwise the
    // caregiver's app shows nothing until they manually refresh, which defeats
    // the point of a time-boxed offer.
    await createNotification(employee.id, 'shift_offer', title, body);
}

module.exports = { name, isConfigured, send };
