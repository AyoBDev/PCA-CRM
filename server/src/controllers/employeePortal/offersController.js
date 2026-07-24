// Employee-portal replacement offers.
//
// The PWA caregiver is already authenticated, so they act on offers as
// themselves rather than through the public token link. Every query here is
// scoped to req.employee.id: an authenticated caregiver must never be able to
// see or answer somebody else's offer, and a request for one is a 404 rather
// than a 403 so the response does not reveal that it exists.
//
// The actual state transitions live in replacementService, so the portal and
// the public token route share one implementation — and therefore one
// double-fill guard. req.db here is set by tenantMiddleware in routes/employee.js.

const replacement = require('../../services/replacementService');
const audit = require('../../services/auditService');

// GET /api/employee/offers
async function getMyOffers(req, res) {
    const offers = await req.db.shiftOffer.findMany({
        where: {
            employeeId: req.employee.id,
            response: '',
            // An offer whose window has closed is not actionable; showing it
            // would invite a tap that can only fail.
            expiresAt: { gt: new Date() },
        },
        include: { shift: { include: { client: true } } },
        orderBy: { offeredAt: 'desc' },
    });

    // Hand-picked fields, same PHI boundary as the public endpoint: being
    // offered a shift is not a reason to expose the client's record.
    res.json(offers.map(o => ({
        id: o.id,
        expiresAt: o.expiresAt,
        offeredAt: o.offeredAt,
        shiftId: o.shift.id,
        shiftDate: o.shift.shiftDate,
        startTime: o.shift.startTime,
        endTime: o.shift.endTime,
        serviceCode: o.shift.serviceCode,
        clientName: o.shift.client.clientName,
        address: o.shift.client.address,
        gateCode: o.shift.client.gateCode,
    })));
}

// POST /api/employee/offers/:id/respond
async function respondToMyOffer(req, res) {
    const { response } = req.body;
    if (!['accept', 'decline'].includes(response)) {
        return res.status(400).json({ error: "response must be 'accept' or 'decline'" });
    }

    const offer = await req.db.shiftOffer.findFirst({
        where: { id: Number(req.params.id), employeeId: req.employee.id },
    });
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    const result = response === 'accept'
        ? await replacement.acceptOffer(req.db, offer.token)
        : await replacement.declineOffer(req.db, offer.token);

    if (result.status === 'already_filled') {
        return res.status(409).json({ status: 'already_filled', error: 'This shift has already been covered' });
    }
    if (['expired', 'already_answered'].includes(result.status)) {
        return res.status(409).json({ status: result.status, error: 'This offer is no longer open' });
    }

    audit.logAction({
        userId: 0,
        userName: req.employee.name,
        userRole: 'pca',
        action: 'UPDATE',
        entityType: 'ShiftOffer',
        entityId: offer.id,
        entityName: `Shift ${offer.shiftId}`,
        changes: [{ field: 'response', oldValue: '', newValue: result.status }],
        metadata: { via: 'employee_portal' },
    });

    res.json(result);
}

module.exports = { getMyOffers, respondToMyOffer };
