const prisma = require('../lib/prisma');

// ── Activity definitions (match the paper form) ──────
const ADL_ACTIVITIES = [
    'Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting',
    'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer',
    'Exer./Passive Range of Motion',
];
const IADL_ACTIVITIES = [
    'Light Housekeeping', 'Medication Reminders', 'Laundry',
    'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding',
];

// ── 15-minute rounding ──────────────────────────
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

// ── CRUD ─────────────────────────────────────────

// GET /api/timesheets
async function listTimesheets(req, res, next) {
    try {
        const where = {};
        if (req.query.status) where.status = req.query.status;
        if (req.query.weekStart) where.weekStart = new Date(req.query.weekStart);
        const timesheets = await prisma.timesheet.findMany({
            where,
            include: { client: { select: { id: true, clientName: true } }, entries: true },
            orderBy: { weekStart: 'desc' },
        });
        res.json(timesheets);
    } catch (err) { next(err); }
}

// GET /api/timesheets/:id
async function getTimesheet(req, res, next) {
    try {
        const id = Number(req.params.id);
        const ts = await prisma.timesheet.findUnique({
            where: { id },
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
        res.json(ts);
    } catch (err) { next(err); }
}

// GET /api/timesheets/activities  — return activity lists
async function getActivities(req, res) {
    res.json({ adl: ADL_ACTIVITIES, iadl: IADL_ACTIVITIES });
}

// POST /api/timesheets
async function createTimesheet(req, res, next) {
    try {
        const { clientId, pcaName, weekStart, clientPhone, clientIdNumber } = req.body;
        if (!clientId || !pcaName || !weekStart) {
            return res.status(400).json({ error: 'clientId, pcaName, weekStart are required' });
        }
        // Compute dates for each day of the week
        const ws = new Date(weekStart);
        const entries = [0, 1, 2, 3, 4, 5, 6].map((d) => {
            const date = new Date(ws);
            date.setDate(ws.getDate() + d);
            return {
                dayOfWeek: d,
                dateOfService: date.toISOString().split('T')[0],
            };
        });

        const ts = await prisma.timesheet.create({
            data: {
                clientId: Number(clientId),
                pcaName: pcaName.trim(),
                weekStart: ws,
                clientPhone: (clientPhone || '').trim(),
                clientIdNumber: (clientIdNumber || '').trim(),
                entries: { create: entries },
            },
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        res.status(201).json(ts);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'A timesheet already exists for this client/PCA/week' });
        next(err);
    }
}

// PUT /api/timesheets/:id
async function updateTimesheet(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.timesheet.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Timesheet not found' });
        if (existing.status === 'submitted') return res.status(400).json({ error: 'Cannot edit a submitted timesheet' });

        const { entries, recipientName, recipientSignature, pcaSignature, pcaFullName, supervisorSignature, completionDate, clientPhone, clientIdNumber } = req.body;

        let totalPasHours = 0;
        let totalHmHours = 0;

        if (entries && Array.isArray(entries)) {
            for (const entry of entries) {
                const adlHours = computeHours(entry.adlTimeIn, entry.adlTimeOut);
                const iadlHours = computeHours(entry.iadlTimeIn, entry.iadlTimeOut);
                totalPasHours += adlHours;
                totalHmHours += iadlHours;

                await prisma.timesheetEntry.update({
                    where: { id: entry.id },
                    data: {
                        dateOfService: entry.dateOfService || '',
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

        const updateData = {
            totalPasHours,
            totalHmHours,
            totalHours: totalPasHours + totalHmHours,
        };
        if (recipientName !== undefined) updateData.recipientName = recipientName;
        if (recipientSignature !== undefined) updateData.recipientSignature = recipientSignature;
        if (pcaSignature !== undefined) updateData.pcaSignature = pcaSignature;
        if (pcaFullName !== undefined) updateData.pcaFullName = pcaFullName;
        if (supervisorSignature !== undefined) updateData.supervisorSignature = supervisorSignature;
        if (completionDate !== undefined) updateData.completionDate = completionDate;
        if (clientPhone !== undefined) updateData.clientPhone = clientPhone;
        if (clientIdNumber !== undefined) updateData.clientIdNumber = clientIdNumber;

        const ts = await prisma.timesheet.update({
            where: { id },
            data: updateData,
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        res.json(ts);
    } catch (err) { next(err); }
}

// PUT /api/timesheets/:id/submit
async function submitTimesheet(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.timesheet.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Timesheet not found' });
        if (existing.status === 'submitted') return res.status(400).json({ error: 'Already submitted' });

        const ts = await prisma.timesheet.update({
            where: { id },
            data: { status: 'submitted', submittedAt: new Date() },
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        res.json(ts);
    } catch (err) { next(err); }
}

// DELETE /api/timesheets/:id
async function deleteTimesheet(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.timesheet.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Timesheet not found' });
        if (existing.status === 'submitted') return res.status(400).json({ error: 'Cannot delete a submitted timesheet' });
        await prisma.timesheet.delete({ where: { id } });
        res.status(204).end();
    } catch (err) { next(err); }
}

module.exports = { listTimesheets, getTimesheet, getActivities, createTimesheet, updateTimesheet, submitTimesheet, deleteTimesheet };
