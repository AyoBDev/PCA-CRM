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
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
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
        const archived = await prisma.timesheet.update({ where: { id }, data: { archivedAt: new Date() } });
        res.json(archived);
    } catch (err) { next(err); }
}

async function restoreTimesheet(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.timesheet.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Timesheet not found' });
        const restored = await prisma.timesheet.update({
            where: { id }, data: { archivedAt: null },
            include: { client: { select: { id: true, clientName: true } }, entries: true },
        });
        res.json(restored);
    } catch (err) { next(err); }
}

// ── PDF Export ─────────────────────────────────────────
const PDFDocument = require('pdfkit');

function hhmm12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function parseBlocks(json) {
    try { return JSON.parse(json || '[]'); } catch { return []; }
}

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

        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 24, bottom: 24, left: 24, right: 24 } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="timesheet-${ts.id}.pdf"`);
        doc.pipe(res);

        const mL = 24, mR = 24;
        const pageW = doc.page.width - mL - mR;
        const pageBottom = doc.page.height - 24;
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

        const labelW = 135;
        const dayW = (pageW - labelW) / 7;
        let gridY;

        // ── Draw a single grid row with full borders ──
        const drawRow = (label, values, opts = {}) => {
            const { bold, bg, height, sectionHeader, fontSize } = { bold: false, bg: null, height: 15, sectionHeader: false, fontSize: 6.5, ...opts };

            // Page overflow — add new page and re-draw day header
            if (gridY + height > pageBottom) {
                doc.addPage();
                gridY = 24;
                drawRow('', dayNames.map((d, i) => {
                    const e = ts.entries[i];
                    const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
                    return `${d}\n${dateStr}`;
                }), { bold: true, bg: '#d9d9d9', height: 22 });
            }

            // Background fill
            if (bg) {
                doc.save().rect(mL, gridY, pageW, height).fill(bg).restore();
            }

            // Outer border for the row
            doc.save().rect(mL, gridY, pageW, height).lineWidth(0.5).stroke('#888').restore();

            // Vertical column dividers
            doc.save().lineWidth(0.3).strokeColor('#888');
            // Label column divider
            doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + height).stroke();
            // Day column dividers
            for (let i = 1; i < 7; i++) {
                const x = mL + labelW + (i * dayW);
                doc.moveTo(x, gridY).lineTo(x, gridY + height).stroke();
            }
            doc.restore();

            // Text
            const textY = gridY + (height - (fontSize * 1.2)) / 2;
            doc.fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000');

            if (sectionHeader) {
                doc.text(label, mL + 4, textY, { width: pageW - 8 });
            } else {
                doc.text(label, mL + 3, textY, { width: labelW - 6, lineBreak: false });
                for (let i = 0; i < 7; i++) {
                    const val = values[i] || '';
                    const x = mL + labelW + (i * dayW);
                    doc.text(String(val), x + 1, textY, { width: dayW - 2, align: 'center', lineBreak: false });
                }
            }

            gridY += height;
        };

        // ── Helper: draw time rows for a section (including extra shifts) ──
        const drawTimeRows = (section, entries) => {
            // Find max shift count
            let maxShifts = 1;
            for (const e of entries) {
                const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                if (blocks.length + 1 > maxShifts) maxShifts = blocks.length + 1;
            }

            for (let s = 0; s < maxShifts; s++) {
                const shiftLabel = maxShifts > 1 ? ` (Shift ${s + 1})` : '';
                if (s === 0) {
                    drawRow(`Time In${shiftLabel}`, entries.map(e => hhmm12(e[`${section}TimeIn`])), { bg: '#f5f5f5' });
                    drawRow(`Time Out${shiftLabel}`, entries.map(e => hhmm12(e[`${section}TimeOut`])));
                } else {
                    const blockIdx = s - 1;
                    drawRow(`Time In${shiftLabel}`, entries.map(e => {
                        const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                        return hhmm12(blocks[blockIdx]?.in);
                    }), { bg: '#f5f5f5' });
                    drawRow(`Time Out${shiftLabel}`, entries.map(e => {
                        const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                        return hhmm12(blocks[blockIdx]?.out);
                    }));
                }
            }

            drawRow('Hours', entries.map(e => e[`${section}Hours`] > 0 ? e[`${section}Hours`].toFixed(2) : ''), { bold: true, bg: '#e8e8e8' });
            drawRow('PCA Initials', entries.map(e => e[`${section}PcaInitials`] || ''));
            drawRow('Client Initials', entries.map(e => e[`${section}ClientInitials`] || ''));
        };

        // ── Title ──
        doc.fontSize(13).font('Helvetica-Bold').text('NV BEST PCA', { align: 'center' });
        doc.fontSize(9).font('Helvetica').text('PCA Service Delivery Record', { align: 'center' });
        doc.moveDown(0.3);

        // ── Info line ──
        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const fmtD = (d) => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

        doc.fontSize(8).font('Helvetica');
        const infoY = doc.y;
        doc.text(`Client: ${ts.client?.clientName || ''}`, mL, infoY);
        doc.text(`Medicaid ID: ${ts.client?.medicaidId || ''}`, 200, infoY);
        doc.text(`PCA: ${ts.pcaName || ''}`, 400, infoY);
        doc.text(`Week: ${fmtD(weekStart)} – ${fmtD(weekEnd)}`, 570, infoY);
        doc.moveDown(0.6);
        gridY = doc.y;

        // ── Day headers ──
        drawRow('', dayNames.map((d, i) => {
            const e = ts.entries[i];
            const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
            return `${d} ${dateStr}`;
        }), { bold: true, bg: '#d9d9d9', height: 17 });

        // ── ADL / PAS Section ──
        drawRow("Activities of Daily Living — ADL's (PAS)", [], { bold: true, bg: '#dbeafe', height: 15, sectionHeader: true });
        for (const act of ADL_ACTIVITIES) {
            const vals = ts.entries.map(e => {
                const activities = JSON.parse(e.adlActivities || '{}');
                return activities[act] ? '\u2713' : '';
            });
            drawRow(act, vals);
        }
        drawTimeRows('adl', ts.entries);

        // ── IADL / Homemaker Section ──
        drawRow("IADL's — Instrumental Activities of Daily Living (Homemaker)", [], { bold: true, bg: '#dbeafe', height: 15, sectionHeader: true });
        for (const act of IADL_ACTIVITIES) {
            const vals = ts.entries.map(e => {
                const activities = JSON.parse(e.iadlActivities || '{}');
                return activities[act] ? '\u2713' : '';
            });
            drawRow(act, vals);
        }
        drawTimeRows('iadl', ts.entries);

        // ── Respite Section (only if data exists) ──
        const hasRespite = ts.entries.some(e => {
            if (e.respiteHours > 0) return true;
            try { const a = JSON.parse(e.respiteActivities || '{}'); return Object.values(a).some(Boolean); } catch { return false; }
        });
        if (hasRespite) {
            drawRow("Respite — Instrumental Activities of Daily Living", [], { bold: true, bg: '#dbeafe', height: 15, sectionHeader: true });
            for (const act of IADL_ACTIVITIES) {
                const vals = ts.entries.map(e => {
                    const activities = JSON.parse(e.respiteActivities || '{}');
                    return activities[act] ? '\u2713' : '';
                });
                drawRow(act, vals);
            }
            drawTimeRows('respite', ts.entries);
        }

        // ── Totals bar ──
        gridY += 4;
        if (gridY + 18 > pageBottom) { doc.addPage(); gridY = 24; }
        doc.save().rect(mL, gridY, pageW, 18).fill('#f0f0f0').rect(mL, gridY, pageW, 18).lineWidth(0.5).stroke('#888').restore();
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
        const totalRespiteHours = ts.totalRespiteHours || 0;
        doc.text(
            `Total PAS: ${ts.totalPasHours.toFixed(2)}      Total HM: ${ts.totalHmHours.toFixed(2)}      Total Respite: ${totalRespiteHours.toFixed(2)}      TOTAL HOURS: ${ts.totalHours.toFixed(2)}`,
            mL + 4, gridY + 4, { width: pageW - 8 }
        );
        gridY += 24;

        // ── Signatures ──
        if (gridY + 80 > pageBottom) { doc.addPage(); gridY = 24; }

        doc.fontSize(8).font('Helvetica').fillColor('#000');
        const sigH = 36;
        const sigW = 180;
        const sigGap = (pageW - sigW * 3) / 4;

        const sigCol1 = mL + sigGap;
        const sigCol2 = sigCol1 + sigW + sigGap;
        const sigCol3 = sigCol2 + sigW + sigGap;

        // Labels
        doc.font('Helvetica-Bold').text('PCA Name:', sigCol1, gridY, { continued: true }).font('Helvetica').text(` ${ts.pcaFullName || ''}`);
        doc.font('Helvetica-Bold').text('Recipient:', sigCol2, gridY, { continued: true }).font('Helvetica').text(` ${ts.recipientName || ''}`);
        doc.font('Helvetica-Bold').text('Supervisor:', sigCol3, gridY, { continued: true }).font('Helvetica').text(` ${ts.supervisorName || 'Sona Hakobyan'}`);
        gridY += 14;

        // Signature images
        if (ts.pcaSignature) {
            try { doc.image(ts.pcaSignature, sigCol1, gridY, { width: sigW, height: sigH }); } catch { /* skip */ }
        }
        doc.save().moveTo(sigCol1, gridY + sigH).lineTo(sigCol1 + sigW, gridY + sigH).lineWidth(0.5).stroke('#333').restore();
        doc.fontSize(6).text('PCA Signature', sigCol1, gridY + sigH + 2, { width: sigW, align: 'center' });

        if (ts.recipientSignature) {
            try { doc.image(ts.recipientSignature, sigCol2, gridY, { width: sigW, height: sigH }); } catch { /* skip */ }
        }
        doc.save().moveTo(sigCol2, gridY + sigH).lineTo(sigCol2 + sigW, gridY + sigH).lineWidth(0.5).stroke('#333').restore();
        doc.fontSize(6).text('Recipient / Responsible Party', sigCol2, gridY + sigH + 2, { width: sigW, align: 'center' });

        if (ts.supervisorSignature) {
            try { doc.image(ts.supervisorSignature, sigCol3, gridY, { width: sigW, height: sigH }); } catch { /* skip */ }
        }
        doc.save().moveTo(sigCol3, gridY + sigH).lineTo(sigCol3 + sigW, gridY + sigH).lineWidth(0.5).stroke('#333').restore();
        doc.fontSize(6).text('Supervisor Signature', sigCol3, gridY + sigH + 2, { width: sigW, align: 'center' });

        if (ts.completionDate) {
            doc.fontSize(7).text(`Date: ${ts.completionDate}`, mL, gridY + sigH + 16);
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

module.exports = { listTimesheets, getTimesheet, getActivities, createTimesheet, updateTimesheet, submitTimesheet, deleteTimesheet, restoreTimesheet, exportTimesheetPdf, updateTimesheetStatus };
