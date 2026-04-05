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

        const token = crypto.randomUUID();

        await prisma.signingToken.create({
            data: { token, timesheetId, role: 'combined', expiresAt },
        });

        const origin = `${req.protocol}://${req.get('host')}`;
        res.json({
            link: `${origin}/sign/${token}`,
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

        const { entries, pcaFullName, pcaSignature, recipientName, recipientSignature, completionDate } = req.body;

        // Update all entries: activities, times, PCA initials, client initials
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
                        adlClientInitials: (entry.adlClientInitials || '').trim(),
                        iadlActivities: typeof entry.iadlActivities === 'string' ? entry.iadlActivities : JSON.stringify(entry.iadlActivities || {}),
                        iadlTimeIn: entry.iadlTimeIn || null,
                        iadlTimeOut: entry.iadlTimeOut || null,
                        iadlHours,
                        iadlPcaInitials: (entry.iadlPcaInitials || '').trim(),
                        iadlClientInitials: (entry.iadlClientInitials || '').trim(),
                    },
                });
            }
        }

        // Recalculate totals
        const allEntries = await prisma.timesheetEntry.findMany({ where: { timesheetId: record.timesheetId } });
        const totalPasHours = allEntries.reduce((s, e) => s + e.adlHours, 0);
        const totalHmHours = allEntries.reduce((s, e) => s + e.iadlHours, 0);

        // Update timesheet with all signature data + mark submitted
        await prisma.timesheet.update({
            where: { id: record.timesheetId },
            data: {
                totalPasHours,
                totalHmHours,
                totalHours: totalPasHours + totalHmHours,
                pcaFullName: pcaFullName || '',
                pcaSignature: pcaSignature || '',
                recipientName: recipientName || '',
                recipientSignature: recipientSignature || '',
                completionDate: completionDate || '',
                status: 'submitted',
                submittedAt: new Date(),
            },
        });

        // Mark token as used
        await prisma.signingToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

        res.json({ success: true });
    } catch (err) { next(err); }
}

// ── Helpers: time rounding & hour computation ──
function roundTo15(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    let rounded;
    if (m <= 7) rounded = 0;
    else if (m <= 22) rounded = 15;
    else if (m <= 37) rounded = 30;
    else if (m <= 52) rounded = 45;
    else { return `${String(h + 1).padStart(2, '0')}:00`; }
    return `${String(h).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

function computeHours(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0;
    const roundedIn = roundTo15(timeIn);
    const roundedOut = roundTo15(timeOut);
    const [hIn, mIn] = roundedIn.split(':').map(Number);
    const [hOut, mOut] = roundedOut.split(':').map(Number);
    const diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
    return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

module.exports = { generateSigningLinks, getSigningForm, submitSigningForm };
