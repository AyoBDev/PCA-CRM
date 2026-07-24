// Replacement workflow API.
//
// Two public token endpoints (getOffer / respondToOffer) sit outside
// authenticate, so anyone holding a token can reach them. They deliberately
// return only what a caregiver needs to decide on a shift — never the client's
// Medicaid ID, DOB, or care notes. Since they cross tenants by token lookup,
// they resolve the offer's agencyId first (via the owner connection) and then
// enter that tenant's context before touching any other tenant data.

const prisma = require('../lib/prisma');
const { enterTokenTenant } = require('../lib/tokenTenant');
const replacement = require('../services/replacementService');
const ranking = require('../services/candidateRankingService');
const settings = require('../services/replacementSettings');
const audit = require('../services/auditService');

function toDateStr(value) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

// POST /api/shifts/:id/callout
async function recordCallout(req, res, next) {
    try {
        const shiftId = Number(req.params.id);
        const { reason = '' } = req.body;

        let result;
        try {
            result = await replacement.recordCallout(req.db, shiftId, {
                reason,
                reportedById: req.user?.id ?? null,
            });
        } catch (err) {
            // "already pending" / "not found" are client mistakes, not server
            // faults — a 500 here would read as a bug in the app.
            return res.status(/not found/i.test(err.message) ? 404 : 400).json({ error: err.message });
        }

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE',
            entityType: 'ShiftCallout',
            entityId: result.callout.id,
            entityName: `Shift ${shiftId}`,
            changes: [],
            metadata: { reason, candidateCount: result.candidates.length, noCoverage: result.noCoverage },
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
}

// GET /api/shifts/:id/replacement-candidates
async function getReplacementCandidates(req, res, next) {
    try {
        const shift = await req.db.shift.findUnique({ where: { id: Number(req.params.id) } });
        if (!shift) return res.status(404).json({ error: 'Shift not found' });

        const result = await ranking.rankCandidates(req.db, {
            clientId: shift.clientId,
            serviceCode: shift.serviceCode,
            date: toDateStr(shift.shiftDate),
            startTime: shift.startTime,
            endTime: shift.endTime,
            excludeEmployeeId: shift.employeeId ?? undefined,
        }, { mode: 'strict', limit: Number(req.query.limit) || undefined });

        // The open callout travels with the candidates so the panel can show
        // WHY cover is needed — the reason was previously write-only, stored
        // and then never surfaced to the person acting on it.
        const callout = await req.db.shiftCallout.findFirst({
            where: { shiftId: shift.id, resolution: 'open' },
            orderBy: { createdAt: 'desc' },
            include: { calloutEmployee: { select: { id: true, name: true, phone: true } } },
        });

        res.json({ ...result, callout });
    } catch (err) {
        next(err);
    }
}

// GET /api/employees/nearby — shared proximity lookup for shift creation
async function getNearbyEmployees(req, res, next) {
    try {
        const { clientId, serviceCode, date, startTime, endTime } = req.query;

        // Soft mode returns unavailable employees too, annotated with their
        // conflicts, so the scheduler can still knowingly assign anyone.
        const result = await ranking.rankCandidates(
            req.db,
            { clientId, serviceCode, date, startTime, endTime },
            { mode: 'soft' },
        );

        // insufficient_input is a normal path, not an error: the form falls back
        // to its plain unranked list until the shift is fully specified.
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// GET /api/shift-offers/:token — PUBLIC
async function getOffer(req, res, next) {
    try {
        // Token lookup crosses tenants by design — resolve on the owner
        // connection first, then enter that offer's agency's tenant context.
        const stub = await prisma.shiftOffer.findUnique({
            where: { token: req.params.token },
            select: { agencyId: true },
        });
        if (!stub) return res.status(404).json({ error: 'Offer not found' });

        await enterTokenTenant(req, res, stub.agencyId, async () => {
            const offer = await req.db.shiftOffer.findUnique({
                where: { token: req.params.token },
                include: {
                    employee: { select: { id: true, name: true } },
                    shift: { include: { client: true } },
                },
            });
            if (!offer) return res.status(404).json({ error: 'Offer not found' });

            const expired = offer.expiresAt && offer.expiresAt.getTime() < Date.now();
            const status = offer.response || (expired ? 'expired' : 'open');

            // Hand-picked fields rather than spreading the client record: this
            // endpoint is unauthenticated, so anything included here is readable by
            // anyone who obtains the token.
            res.json({
                status,
                expiresAt: offer.expiresAt,
                employee: offer.employee,
                shift: {
                    id: offer.shift.id,
                    shiftDate: offer.shift.shiftDate,
                    startTime: offer.shift.startTime,
                    endTime: offer.shift.endTime,
                    serviceCode: offer.shift.serviceCode,
                },
                client: {
                    clientName: offer.shift.client.clientName,
                    address: offer.shift.client.address,
                    gateCode: offer.shift.client.gateCode,
                },
            });
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/shift-offers/:token/respond — PUBLIC
async function respondToOffer(req, res, next) {
    try {
        const { response } = req.body;
        if (!['accept', 'decline'].includes(response)) {
            return res.status(400).json({ error: "response must be 'accept' or 'decline'" });
        }

        // Token lookup crosses tenants by design — resolve on the owner
        // connection first, then enter that offer's agency's tenant context.
        const stub = await prisma.shiftOffer.findUnique({
            where: { token: req.params.token },
            select: { agencyId: true },
        });
        if (!stub) return res.status(404).json({ error: 'Offer not found' });

        await enterTokenTenant(req, res, stub.agencyId, async () => {
            const result = response === 'accept'
                ? await replacement.acceptOffer(req.db, req.params.token)
                : await replacement.declineOffer(req.db, req.params.token);

            if (result.status === 'not_found') return res.status(404).json({ error: 'Offer not found' });
            if (result.status === 'already_filled') {
                return res.status(409).json({ status: 'already_filled', error: 'This shift has already been covered' });
            }
            if (['expired', 'already_answered'].includes(result.status)) {
                return res.status(409).json({ status: result.status, error: 'This offer is no longer open' });
            }

            // No req.user on a public endpoint — CLAUDE.md specifies userId 0 with
            // the entity name as userName.
            audit.logAction({
                userId: req.user?.id ?? 0,
                userName: req.user?.name ?? result.offer?.employee?.name ?? 'Caregiver',
                userRole: req.user?.role ?? 'system',
                action: 'UPDATE',
                entityType: 'ShiftOffer',
                entityId: result.offer?.id ?? 0,
                entityName: `Shift ${result.offer?.shiftId ?? ''}`,
                changes: [{ field: 'response', oldValue: '', newValue: result.status }],
                metadata: { via: 'public_token' },
            });

            res.json(result);
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/shifts/:id/offers
async function createOffer(req, res, next) {
    try {
        const shiftId = Number(req.params.id);
        const { employeeId, calloutId, rank, scoreBreakdown, responseWindowMinutes, channel } = req.body;
        if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

        const result = await replacement.offerToCandidate(req.db, shiftId, Number(employeeId), {
            calloutId: calloutId ? Number(calloutId) : null,
            rank: Number(rank) || 0,
            scoreBreakdown: scoreBreakdown || {},
            ...(responseWindowMinutes ? { responseWindowMinutes: Number(responseWindowMinutes) } : {}),
            ...(channel ? { channel } : {}),
        });

        if (result.skipped) {
            return res.status(409).json({ error: `Candidate unavailable (${result.reason})`, ...result });
        }

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE',
            entityType: 'ShiftOffer',
            entityId: result.offer.id,
            entityName: `Shift ${shiftId}`,
            changes: [],
            metadata: { employeeId: Number(employeeId), channels: result.channels || [] },
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
}

// POST /api/shifts/:id/auto-offer — starts the automated offer chain.
//
// Gated on the shift_replacement WorkflowTrigger. Offers exactly ONE candidate:
// the rest follow only if this one's window closes unanswered, driven by the
// expiry worker. Broadcasting to everyone at once would invite the double-fill
// race the whole design exists to avoid.
async function startAutoOffer(req, res, next) {
    try {
        const { autoOfferEnabled, responseWindowMinutes } = await settings.getReplacementSettings(req.db, req.user.agencyId);
        if (!autoOfferEnabled) {
            return res.status(403).json({
                error: 'Automatic offering is disabled. Enable the "Shift Replacement" workflow trigger to turn it on.',
            });
        }

        const shift = await req.db.shift.findUnique({ where: { id: Number(req.params.id) } });
        if (!shift) return res.status(404).json({ error: 'Shift not found' });

        const ranked = await ranking.rankCandidates(req.db, {
            clientId: shift.clientId,
            serviceCode: shift.serviceCode,
            date: toDateStr(shift.shiftDate),
            startTime: shift.startTime,
            endTime: shift.endTime,
            excludeEmployeeId: shift.employeeId ?? undefined,
        }, { mode: 'strict' });

        const candidates = ranked.eligible || [];
        if (candidates.length === 0) {
            return res.json({ noCoverage: true, offered: null });
        }

        const callout = await req.db.shiftCallout.findFirst({
            where: { shiftId: shift.id, resolution: 'open' },
            orderBy: { createdAt: 'desc' },
        });

        const top = candidates[0];
        const result = await replacement.offerToCandidate(req.db, shift.id, top.employeeId, {
            calloutId: callout?.id ?? null,
            rank: top.rank,
            scoreBreakdown: top.scoreBreakdown || {},
            responseWindowMinutes,
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE',
            entityType: 'ShiftOffer',
            entityId: result.offer?.id ?? 0,
            entityName: `Shift ${shift.id}`,
            changes: [],
            metadata: { auto: true, employeeId: top.employeeId, responseWindowMinutes },
        });

        res.json({ noCoverage: false, offered: result });
    } catch (err) {
        next(err);
    }
}

// POST /api/shifts/:id/offers/:offerId/record-response
//
// The office took the answer by phone. Records it against the existing offer so
// the compliance trail matches what actually happened, rather than the admin
// reassigning the shift by hand and leaving the offer showing "awaiting reply".
//
// Routed through the same acceptOffer/declineOffer as every other path, so a
// phoned-in acceptance is subject to the identical double-fill guard.
async function recordOfferResponse(req, res, next) {
    try {
        const { response, note = '' } = req.body;
        if (!['accept', 'decline'].includes(response)) {
            return res.status(400).json({ error: "response must be 'accept' or 'decline'" });
        }

        const offer = await req.db.shiftOffer.findFirst({
            where: { id: Number(req.params.offerId), shiftId: Number(req.params.id) },
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

        // Attributed to the admin who took the call — they are the one making
        // the record, and the note is their account of what was said.
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE',
            entityType: 'ShiftOffer',
            entityId: offer.id,
            entityName: `Shift ${offer.shiftId}`,
            changes: [{ field: 'response', oldValue: '', newValue: result.status }],
            metadata: { via: 'phone', note },
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
}

// GET /api/shifts/:id/offers
async function listOffers(req, res, next) {
    try {
        const offers = await req.db.shiftOffer.findMany({
            where: { shiftId: Number(req.params.id) },
            include: { employee: { select: { id: true, name: true } } },
            orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
        });
        res.json(offers);
    } catch (err) {
        next(err);
    }
}

// POST /api/callouts/:id/resolve
async function resolveCallout(req, res, next) {
    try {
        const { resolution } = req.body;
        if (!['filled', 'no_coverage', 'cancelled'].includes(resolution)) {
            return res.status(400).json({ error: 'Invalid resolution' });
        }

        const callout = await replacement.resolveCallout(req.db, Number(req.params.id), resolution);

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE',
            entityType: 'ShiftCallout',
            entityId: callout.id,
            entityName: `Shift ${callout.shiftId}`,
            changes: [{ field: 'resolution', oldValue: 'open', newValue: resolution }],
            metadata: {},
        });

        res.json(callout);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    recordCallout,
    getReplacementCandidates,
    getNearbyEmployees,
    getOffer,
    respondToOffer,
    createOffer,
    startAutoOffer,
    listOffers,
    recordOfferResponse,
    resolveCallout,
};
