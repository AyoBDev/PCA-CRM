const crypto = require('crypto');
const prisma = require('../lib/prisma');

// ── Generate signing links ──
async function generateSigningLinks(req, res, next) {
    try {
        const timesheetId = Number(req.params.id);
        const ts = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });

        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

        // Invalidate any existing unused tokens for this timesheet
        await prisma.signingToken.updateMany({
            where: { timesheetId, usedAt: null },
            data: { usedAt: new Date() },
        });

        const pcaToken = crypto.randomUUID();
        const clientToken = crypto.randomUUID();

        await prisma.signingToken.createMany({
            data: [
                { token: pcaToken, timesheetId, role: 'pca', expiresAt },
                { token: clientToken, timesheetId, role: 'client', expiresAt },
            ],
        });

        // Build URLs using the request's origin
        const origin = `${req.protocol}://${req.get('host')}`.replace(/:\d+$/, ':5173');
        res.json({
            pcaLink: `${origin}/sign/${pcaToken}`,
            clientLink: `${origin}/sign/${clientToken}`,
            expiresAt,
        });
    } catch (err) { next(err); }
}

// ── Validate token & return form data ──
async function getSigningForm(req, res, next) {
    try {
        const { token } = req.params;
        const record = await prisma.signingToken.findUnique({
            where: { token },
            include: {
                timesheet: {
                    include: {
                        client: { select: { id: true, clientName: true } },
                        entries: { orderBy: { dayOfWeek: 'asc' } },
                    },
                },
            },
        });

        if (!record) return res.status(404).json({ error: 'Invalid link' });
        if (record.usedAt) return res.status(410).json({ error: 'This link has already been used' });
        if (new Date() > record.expiresAt) return res.status(410).json({ error: 'This link has expired' });

        res.json({
            role: record.role,
            timesheet: record.timesheet,
        });
    } catch (err) { next(err); }
}

// ── Submit form via token ──
async function submitSigningForm(req, res, next) {
    try {
        const { token } = req.params;
        const record = await prisma.signingToken.findUnique({
            where: { token },
            include: { timesheet: { include: { entries: { orderBy: { dayOfWeek: 'asc' } } } } },
        });

        if (!record) return res.status(404).json({ error: 'Invalid link' });
        if (record.usedAt) return res.status(410).json({ error: 'This link has already been used' });
        if (new Date() > record.expiresAt) return res.status(410).json({ error: 'This link has expired' });

        const { entries, ...fields } = req.body;

        if (record.role === 'pca') {
            // PCA can update: entries (activities, times, pca initials), pcaSignature, pcaFullName
            if (entries && Array.isArray(entries)) {
                for (const entry of entries) {
                    const existing = record.timesheet.entries.find(e => e.id === entry.id);
                    if (!existing) continue;

                    const adlHours = computeHours(entry.adlTimeIn, entry.adlTimeOut);
                    const iadlHours = computeHours(entry.iadlTimeIn, entry.iadlTimeOut);

                    await prisma.timesheetEntry.update({
                        where: { id: entry.id },
                        data: {
                            dateOfService: entry.dateOfService || existing.dateOfService,
                            adlActivities: typeof entry.adlActivities === 'string' ? entry.adlActivities : JSON.stringify(entry.adlActivities || {}),
                            adlTimeIn: entry.adlTimeIn || null,
                            adlTimeOut: entry.adlTimeOut || null,
                            adlHours,
                            adlPcaInitials: (entry.adlPcaInitials || '').trim(),
                            iadlActivities: typeof entry.iadlActivities === 'string' ? entry.iadlActivities : JSON.stringify(entry.iadlActivities || {}),
                            iadlTimeIn: entry.iadlTimeIn || null,
                            iadlTimeOut: entry.iadlTimeOut || null,
                            iadlHours,
                            iadlPcaInitials: (entry.iadlPcaInitials || '').trim(),
                        },
                    });
                }
            }

            // Recalculate totals
            const allEntries = await prisma.timesheetEntry.findMany({ where: { timesheetId: record.timesheetId } });
            const totalPasHours = allEntries.reduce((s, e) => s + e.adlHours, 0);
            const totalHmHours = allEntries.reduce((s, e) => s + e.iadlHours, 0);

            const updateData = { totalPasHours, totalHmHours, totalHours: totalPasHours + totalHmHours };
            if (fields.pcaSignature !== undefined) updateData.pcaSignature = fields.pcaSignature;
            if (fields.pcaFullName !== undefined) updateData.pcaFullName = fields.pcaFullName;

            await prisma.timesheet.update({ where: { id: record.timesheetId }, data: updateData });

        } else if (record.role === 'client') {
            // Client can update: client initials per entry, recipientName, recipientSignature
            if (entries && Array.isArray(entries)) {
                for (const entry of entries) {
                    const existing = record.timesheet.entries.find(e => e.id === entry.id);
                    if (!existing) continue;

                    await prisma.timesheetEntry.update({
                        where: { id: entry.id },
                        data: {
                            adlClientInitials: (entry.adlClientInitials || '').trim(),
                            iadlClientInitials: (entry.iadlClientInitials || '').trim(),
                        },
                    });
                }
            }

            const updateData = {};
            if (fields.recipientName !== undefined) updateData.recipientName = fields.recipientName;
            if (fields.recipientSignature !== undefined) updateData.recipientSignature = fields.recipientSignature;

            if (Object.keys(updateData).length > 0) {
                await prisma.timesheet.update({ where: { id: record.timesheetId }, data: updateData });
            }
        }

        // Mark token as used
        await prisma.signingToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

        res.json({ success: true });
    } catch (err) { next(err); }
}

// ── Helper: compute hours from time strings ──
function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const [hIn, mIn] = timeIn.split(':').map(Number);
    const [hOut, mOut] = timeOut.split(':').map(Number);
    const diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

module.exports = { generateSigningLinks, getSigningForm, submitSigningForm };
