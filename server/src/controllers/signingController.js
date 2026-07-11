const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { enterTokenTenant } = require('../lib/tokenTenant');

// ── Generate signing links ──
async function generateSigningLinks(req, res, next) {
    try {
        const timesheetId = Number(req.params.id);
        const ts = await req.db.timesheet.findUnique({ where: { id: timesheetId } });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });

        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

        // Invalidate any existing unused tokens for this timesheet
        await req.db.signingToken.updateMany({
            where: { timesheetId, usedAt: null },
            data: { usedAt: new Date() },
        });

        const token = crypto.randomUUID();

        await req.db.signingToken.create({
            data: { token, timesheetId, role: 'combined', expiresAt },
        });

        const origin = `${req.protocol}://${req.get('host')}`;
        res.json({
            link: `${origin}/sign/${token}`,
            expiresAt,
        });
    } catch (err) { next(err); }
}

// ── Resolve signing token to permanent link ──
async function getSigningForm(req, res, next) {
    try {
        const { token } = req.params;
        const record = await prisma.signingToken.findUnique({
            where: { token },
            include: {
                timesheet: {
                    include: { client: true },
                },
            },
        });

        if (!record) return res.status(404).json({ error: 'Invalid link' });

        await enterTokenTenant(req, res, record.agencyId, async () => {
            const db = req.db;
            // Find or auto-create the permanent link for this client+PCA pair
            let permanentLink = await db.permanentLink.findFirst({
                where: {
                    clientId: record.timesheet.clientId,
                    pcaName: record.timesheet.pcaName,
                },
            });

            if (!permanentLink) {
                permanentLink = await db.permanentLink.create({
                    data: {
                        clientId: record.timesheet.clientId,
                        pcaName: record.timesheet.pcaName,
                    },
                });
            } else if (!permanentLink.active) {
                permanentLink = await db.permanentLink.update({
                    where: { id: permanentLink.id },
                    data: { active: true },
                });
            }

            res.json({ redirect: permanentLink.token });
        });
    } catch (err) { next(err); }
}

// ── Submit via signing token — deprecated, redirect to permanent link ──
async function submitSigningForm(req, res, next) {
    return res.status(410).json({ error: 'This link type is no longer supported. Please use your permanent link.' });
}

module.exports = { generateSigningLinks, getSigningForm, submitSigningForm };
