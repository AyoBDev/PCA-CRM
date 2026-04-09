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
            include: { client: true, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });
        res.json(ts);
    } catch (err) { next(err); }
}

// GET /api/timesheets/activities  — return activity lists
async function getActivities(req, res) {
    res.json({ adl: ADL_ACTIVITIES, iadl: IADL_ACTIVITIES, respite: IADL_ACTIVITIES });
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
        if (existing.status === 'submitted' && (!req.user || req.user.role !== 'admin')) {
            return res.status(400).json({ error: 'Cannot edit a submitted timesheet' });
        }

        const { entries, recipientName, recipientSignature, pcaSignature, pcaFullName, supervisorSignature, completionDate, clientPhone, clientIdNumber } = req.body;

        let totalPasHours = 0;
        let totalHmHours = 0;
        let totalRespiteHours = 0;

        if (entries && Array.isArray(entries)) {
            for (const entry of entries) {
                const adlHours = computeHours(entry.adlTimeIn, entry.adlTimeOut);
                const iadlHours = computeHours(entry.iadlTimeIn, entry.iadlTimeOut);
                const respiteHours = computeHours(entry.respiteTimeIn, entry.respiteTimeOut);
                totalPasHours += adlHours;
                totalHmHours += iadlHours;
                totalRespiteHours += respiteHours;

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
                        respiteActivities: typeof entry.respiteActivities === 'string' ? entry.respiteActivities : JSON.stringify(entry.respiteActivities || {}),
                        respiteTimeIn: entry.respiteTimeIn || null,
                        respiteTimeOut: entry.respiteTimeOut || null,
                        respiteHours: computeHours(entry.respiteTimeIn, entry.respiteTimeOut),
                        respitePcaInitials: (entry.respitePcaInitials || '').trim(),
                        respiteClientInitials: (entry.respiteClientInitials || '').trim(),
                    },
                });
            }
        }

        const updateData = {
            totalPasHours,
            totalHmHours,
            totalRespiteHours,
            totalHours: totalPasHours + totalHmHours + totalRespiteHours,
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
        if (existing.status !== 'draft' && (!req.user || req.user.role !== 'admin')) {
            return res.status(400).json({ error: 'Only admins can delete submitted timesheets' });
        }
        await prisma.timesheet.delete({ where: { id } });
        res.status(204).end();
    } catch (err) { next(err); }
}

// ── PDF Export ─────────────────────────────────────────
const PDFDocument = require('pdfkit');

async function exportTimesheetPdf(req, res, next) {
    try {
        const id = Number(req.params.id);
        const ts = await prisma.timesheet.findUnique({
            where: { id },
            include: {
                client: true,
                entries: { orderBy: { dayOfWeek: 'asc' } },
            },
        });
        if (!ts) return res.status(404).json({ error: 'Timesheet not found' });

        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 30, bottom: 30, left: 30, right: 30 } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="timesheet-${ts.id}.pdf"`);
        doc.pipe(res);

        const pageW = doc.page.width - 60;
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

        // ── Header ──
        doc.fontSize(14).font('Helvetica-Bold').text('NV BEST PCA', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('PCA Service Delivery Record', { align: 'center' });
        doc.moveDown(0.3);

        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const fmtD = (d) => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

        doc.fontSize(8).font('Helvetica');
        const infoY = doc.y;
        doc.text(`Client: ${ts.client?.clientName || ''}`, 30, infoY);
        doc.text(`Medicaid ID: ${ts.client?.medicaidId || ''}`, 200, infoY);
        doc.text(`PCA: ${ts.pcaName || ''}`, 400, infoY);
        doc.text(`Week: ${fmtD(weekStart)} - ${fmtD(weekEnd)}`, 580, infoY);
        doc.moveDown(0.8);

        // ── Activity Grid ──
        const labelW = 130;
        const dayW = (pageW - labelW) / 7;
        let gridY = doc.y;

        const drawRow = (label, values, opts = {}) => {
            const { bold, bg, height } = { bold: false, bg: null, height: 14, ...opts };
            if (bg) {
                doc.save().rect(30, gridY, pageW, height).fill(bg).restore();
            }
            doc.fontSize(7).font(bold ? 'Helvetica-Bold' : 'Helvetica');
            doc.fillColor('#000');
            doc.text(label, 32, gridY + 2, { width: labelW - 4 });
            for (let i = 0; i < 7; i++) {
                const val = values[i] || '';
                const x = 30 + labelW + (i * dayW);
                doc.text(String(val), x + 2, gridY + 2, { width: dayW - 4, align: 'center' });
            }
            gridY += height;
            doc.save().moveTo(30, gridY).lineTo(30 + pageW, gridY).lineWidth(0.3).stroke('#ccc').restore();
        };

        drawRow('', dayNames.map((d, i) => {
            const e = ts.entries[i];
            const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
            return `${d} ${dateStr}`;
        }), { bold: true, bg: '#e8e8e8' });

        drawRow("Activities of Daily Living — ADL's (PAS)", Array(7).fill(''), { bold: true, bg: '#f0f0f0' });

        const adlActs = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Cane, Walker W/Chair', 'Transfer', 'Exer./Passive Range of Motion'];
        for (const act of adlActs) {
            const vals = ts.entries.map((e) => {
                const activities = JSON.parse(e.adlActivities || '{}');
                return activities[act] ? '\u2713' : '';
            });
            drawRow(act, vals);
        }

        drawRow('Time In', ts.entries.map((e) => e.adlTimeIn || ''), { bg: '#f8f8f8' });
        drawRow('Time Out', ts.entries.map((e) => e.adlTimeOut || ''));
        drawRow('Hours', ts.entries.map((e) => e.adlHours > 0 ? e.adlHours.toFixed(2) : ''), { bold: true });
        drawRow('PCA Initials', ts.entries.map((e) => e.adlPcaInitials || ''), { bg: '#e8f0ff' });
        drawRow('Client Initials', ts.entries.map((e) => e.adlClientInitials || ''), { bg: '#e8ffe8' });

        gridY += 6;

        drawRow("IADL's Instrumental Activities of Daily Living (HM)", Array(7).fill(''), { bold: true, bg: '#f0f0f0' });

        const iadlActs = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];
        for (const act of iadlActs) {
            const vals = ts.entries.map((e) => {
                const activities = JSON.parse(e.iadlActivities || '{}');
                return activities[act] ? '\u2713' : '';
            });
            drawRow(act, vals);
        }

        drawRow('Time In', ts.entries.map((e) => e.iadlTimeIn || ''), { bg: '#f8f8f8' });
        drawRow('Time Out', ts.entries.map((e) => e.iadlTimeOut || ''));
        drawRow('Hours', ts.entries.map((e) => e.iadlHours > 0 ? e.iadlHours.toFixed(2) : ''), { bold: true });
        drawRow('PCA Initials', ts.entries.map((e) => e.iadlPcaInitials || ''), { bg: '#e8f0ff' });
        drawRow('Client Initials', ts.entries.map((e) => e.iadlClientInitials || ''), { bg: '#e8ffe8' });

        gridY += 6;

        // ── Respite Section (only if any entry has respite data) ──
        const hasRespite = ts.entries.some((e) => {
            if (e.respiteHours > 0) return true;
            try { const a = JSON.parse(e.respiteActivities || '{}'); return Object.values(a).some(Boolean); } catch (_) { return false; }
        });
        if (hasRespite) {
            drawRow("Respite — Instrumental Activities of Daily Living", Array(7).fill(''), { bold: true, bg: '#f0f0f0' });

            const respiteActs = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding'];
            for (const act of respiteActs) {
                const vals = ts.entries.map((e) => {
                    const activities = JSON.parse(e.respiteActivities || '{}');
                    return activities[act] ? '\u2713' : '';
                });
                drawRow(act, vals);
            }

            drawRow('Time In', ts.entries.map((e) => e.respiteTimeIn || ''), { bg: '#f8f8f8' });
            drawRow('Time Out', ts.entries.map((e) => e.respiteTimeOut || ''));
            drawRow('Hours', ts.entries.map((e) => e.respiteHours > 0 ? e.respiteHours.toFixed(2) : ''), { bold: true });
            drawRow('PCA Initials', ts.entries.map((e) => e.respitePcaInitials || ''), { bg: '#e8f0ff' });
            drawRow('Client Initials', ts.entries.map((e) => e.respiteClientInitials || ''), { bg: '#e8ffe8' });

            gridY += 6;
        }

        gridY += 4;

        // ── Totals ──
        doc.y = gridY;
        doc.fontSize(9).font('Helvetica-Bold');
        const totalRespiteHours = ts.totalRespiteHours || 0;
        doc.text(`Total PAS Hours: ${ts.totalPasHours.toFixed(2)}     Total HM Hours: ${ts.totalHmHours.toFixed(2)}     Total Respite Hours: ${totalRespiteHours.toFixed(2)}     Total Hours: ${ts.totalHours.toFixed(2)}`, 30, gridY);
        gridY += 20;

        // ── Signatures ──
        doc.y = gridY;
        doc.fontSize(8).font('Helvetica');
        const sigH = 40;
        const sigW = 200;

        doc.text('PCA Name: ' + (ts.pcaFullName || ''), 30, gridY);
        gridY += 12;
        if (ts.pcaSignature) {
            try { doc.image(ts.pcaSignature, 30, gridY, { width: sigW, height: sigH }); } catch (_) { /* skip invalid sig */ }
        }
        doc.text('PCA Signature', 30, gridY + sigH + 2);

        const sigCol2 = 300;
        doc.text('Recipient Name: ' + (ts.recipientName || ''), sigCol2, gridY - 12);
        if (ts.recipientSignature) {
            try { doc.image(ts.recipientSignature, sigCol2, gridY, { width: sigW, height: sigH }); } catch (_) { /* skip invalid sig */ }
        }
        doc.text('Recipient / Responsible Party Signature', sigCol2, gridY + sigH + 2);

        const sigCol3 = 560;
        doc.text('Supervisor: ' + (ts.supervisorName || 'Sona Hakobyan'), sigCol3, gridY - 12);
        if (ts.supervisorSignature) {
            try { doc.image(ts.supervisorSignature, sigCol3, gridY, { width: sigW, height: sigH }); } catch (_) { /* skip invalid sig */ }
        }
        doc.text('Supervisor Signature', sigCol3, gridY + sigH + 2);

        if (ts.completionDate) {
            doc.text(`Date: ${ts.completionDate}`, 30, gridY + sigH + 16);
        }

        doc.end();
    } catch (err) { next(err); }
}

// PUT /api/timesheets/:id/status
async function updateTimesheetStatus(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { status } = req.body;
        if (!['draft', 'submitted'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const ts = await prisma.timesheet.update({
            where: { id },
            data: { status, submittedAt: status === 'draft' ? null : new Date() },
            include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        res.json(ts);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Timesheet not found' });
        next(err);
    }
}

module.exports = { listTimesheets, getTimesheet, getActivities, createTimesheet, updateTimesheet, submitTimesheet, deleteTimesheet, exportTimesheetPdf, updateTimesheetStatus };
