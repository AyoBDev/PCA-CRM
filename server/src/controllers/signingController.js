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
                        client: true,
                        entries: { orderBy: { dayOfWeek: 'asc' } },
                    },
                },
            },
        });

        if (!record) return res.status(404).json({ error: 'Invalid link' });
        if (record.usedAt) return res.status(410).json({ error: 'This link has already been used' });
        if (new Date() > record.expiresAt) return res.status(410).json({ error: 'This link has expired' });

        // Parse enabledServices into an array for the frontend
        const timesheet = record.timesheet;
        let enabledServices = ['PAS', 'Homemaker'];
        try {
            const parsed = JSON.parse(timesheet.client?.enabledServices || '["PAS","Homemaker"]');
            if (Array.isArray(parsed)) enabledServices = parsed;
        } catch {}

        res.json({
            role: record.role,
            timesheet: {
                ...timesheet,
                client: {
                    id: timesheet.client.id,
                    clientName: timesheet.client.clientName,
                    enabledServices,
                },
            },
        });
    } catch (err) { next(err); }
}

// ── Submit form via token ──
async function submitSigningForm(req, res, next) {
    try {
        const { token } = req.params;
        const record = await prisma.signingToken.findUnique({
            where: { token },
            include: {
                timesheet: {
                    include: {
                        client: true,
                        entries: { orderBy: { dayOfWeek: 'asc' } },
                    },
                },
            },
        });

        if (!record) return res.status(404).json({ error: 'Invalid link' });
        if (record.usedAt) return res.status(410).json({ error: 'This link has already been used' });
        if (new Date() > record.expiresAt) return res.status(410).json({ error: 'This link has expired' });

        const { entries, pcaFullName, pcaSignature, recipientName, recipientSignature, completionDate } = req.body;

        // Parse enabledServices (re-read client to ensure latest admin changes are reflected)
        let enabledServices = ['PAS', 'Homemaker'];
        try {
            const parsed = JSON.parse(record.timesheet.client?.enabledServices || '["PAS","Homemaker"]');
            if (Array.isArray(parsed)) enabledServices = parsed;
        } catch {}

        // Validate submit gate
        if (!pcaFullName || !pcaSignature || !recipientName || !recipientSignature) {
            return res.status(400).json({ error: 'All signatures and names are required' });
        }

        const errors = [];
        for (const entry of (entries || [])) {
            const filtered = filterByEnabledServices(entry, enabledServices);
            const dayLabel = `Day ${entry.dayOfWeek !== undefined ? entry.dayOfWeek : '?'}`;

            if (hasActivity(filtered.adlActivities)) {
                if (!filtered.adlTimeIn || !filtered.adlTimeOut) {
                    errors.push(`${dayLabel}: ADL has activities but missing time in/out`);
                }
                if (!filtered.adlPcaInitials || !filtered.adlClientInitials) {
                    errors.push(`${dayLabel}: ADL missing initials`);
                }
            }
            if (hasActivity(filtered.iadlActivities)) {
                if (!filtered.iadlTimeIn || !filtered.iadlTimeOut) {
                    errors.push(`${dayLabel}: IADL (Homemaker) has activities but missing time in/out`);
                }
                if (!filtered.iadlPcaInitials || !filtered.iadlClientInitials) {
                    errors.push(`${dayLabel}: IADL (Homemaker) missing initials`);
                }
            }
            if (hasActivity(filtered.respiteActivities)) {
                if (!filtered.respiteTimeIn || !filtered.respiteTimeOut) {
                    errors.push(`${dayLabel}: Respite has activities but missing time in/out`);
                }
                if (!filtered.respitePcaInitials || !filtered.respiteClientInitials) {
                    errors.push(`${dayLabel}: Respite missing initials`);
                }
            }

            if (filtered.iadlTimeIn && filtered.iadlTimeOut && filtered.respiteTimeIn && filtered.respiteTimeOut) {
                if (timesOverlap(filtered.iadlTimeIn, filtered.iadlTimeOut, filtered.respiteTimeIn, filtered.respiteTimeOut)) {
                    errors.push(`${dayLabel}: Homemaker and Respite times overlap`);
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join('; ') });
        }

        // Update all entries: activities, times, PCA initials, client initials (filtered by enabledServices)
        let totalPasHours = 0, totalHmHours = 0, totalRespiteHours = 0;

        if (entries && Array.isArray(entries)) {
            for (const entry of entries) {
                const existing = record.timesheet.entries.find(e => e.id === entry.id);
                if (!existing) continue;

                const filtered = filterByEnabledServices(entry, enabledServices);
                const adlHours = computeHours(filtered.adlTimeIn, filtered.adlTimeOut);
                const iadlHours = computeHours(filtered.iadlTimeIn, filtered.iadlTimeOut);
                const respiteHours = computeHours(filtered.respiteTimeIn, filtered.respiteTimeOut);

                totalPasHours += adlHours;
                totalHmHours += iadlHours;
                totalRespiteHours += respiteHours;

                await prisma.timesheetEntry.update({
                    where: { id: entry.id },
                    data: {
                        dateOfService: entry.dateOfService || existing.dateOfService,
                        adlActivities: typeof filtered.adlActivities === 'string' ? filtered.adlActivities : JSON.stringify(filtered.adlActivities || {}),
                        adlTimeIn: filtered.adlTimeIn || null,
                        adlTimeOut: filtered.adlTimeOut || null,
                        adlHours,
                        adlPcaInitials: (filtered.adlPcaInitials || '').trim(),
                        adlClientInitials: (filtered.adlClientInitials || '').trim(),
                        iadlActivities: typeof filtered.iadlActivities === 'string' ? filtered.iadlActivities : JSON.stringify(filtered.iadlActivities || {}),
                        iadlTimeIn: filtered.iadlTimeIn || null,
                        iadlTimeOut: filtered.iadlTimeOut || null,
                        iadlHours,
                        iadlPcaInitials: (filtered.iadlPcaInitials || '').trim(),
                        iadlClientInitials: (filtered.iadlClientInitials || '').trim(),
                        respiteActivities: typeof filtered.respiteActivities === 'string' ? filtered.respiteActivities : JSON.stringify(filtered.respiteActivities || {}),
                        respiteTimeIn: filtered.respiteTimeIn || null,
                        respiteTimeOut: filtered.respiteTimeOut || null,
                        respiteHours,
                        respitePcaInitials: (filtered.respitePcaInitials || '').trim(),
                        respiteClientInitials: (filtered.respiteClientInitials || '').trim(),
                    },
                });
            }
        }

        // Update timesheet with all signature data + mark submitted
        await prisma.timesheet.update({
            where: { id: record.timesheetId },
            data: {
                totalPasHours,
                totalHmHours,
                totalRespiteHours,
                totalHours: totalPasHours + totalHmHours + totalRespiteHours,
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

function hasActivity(activitiesJson) {
    try {
        const obj = JSON.parse(activitiesJson || '{}');
        return Object.values(obj).some(v => v === true);
    } catch {
        return false;
    }
}

function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function timesOverlap(aIn, aOut, bIn, bOut) {
    const a0 = timeToMinutes(aIn), a1 = timeToMinutes(aOut);
    const b0 = timeToMinutes(bIn), b1 = timeToMinutes(bOut);
    if (a0 === null || a1 === null || b0 === null || b1 === null) return false;
    return a0 < b1 && b0 < a1;
}

function filterByEnabledServices(entry, enabledServices) {
    const filtered = { ...entry };
    if (!enabledServices.includes('PAS')) {
        filtered.adlActivities = '{}';
        filtered.adlTimeIn = null;
        filtered.adlTimeOut = null;
        filtered.adlPcaInitials = '';
        filtered.adlClientInitials = '';
    }
    if (!enabledServices.includes('Homemaker')) {
        filtered.iadlActivities = '{}';
        filtered.iadlTimeIn = null;
        filtered.iadlTimeOut = null;
        filtered.iadlPcaInitials = '';
        filtered.iadlClientInitials = '';
    }
    if (!enabledServices.includes('Respite')) {
        filtered.respiteActivities = '{}';
        filtered.respiteTimeIn = null;
        filtered.respiteTimeOut = null;
        filtered.respitePcaInitials = '';
        filtered.respiteClientInitials = '';
    }
    return filtered;
}

module.exports = { generateSigningLinks, getSigningForm, submitSigningForm };
