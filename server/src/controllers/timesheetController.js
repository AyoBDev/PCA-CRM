const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const { filterAuthsByWeek } = require('../services/authorizationService');

// ── Activity definitions (match the paper form) ──────
const ADL_ACTIVITIES = [
    'Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting',
    'Ambulation/Mobility', 'Transfer',
];
const IADL_ACTIVITIES = [
    'Light Housekeeping', 'Medication Reminders', 'Laundry',
    'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding',
];
const RESPITE_ACTIVITIES = ['Companionship', 'Safety Supervision'];

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

function computeTotalHoursWithBlocks(timeIn, timeOut, timeBlocksJson) {
    let total = computeHours(timeIn, timeOut);
    try {
        const blocks = JSON.parse(timeBlocksJson || '[]');
        for (const b of blocks) total += computeHours(b.in, b.out);
    } catch {}
    return Math.round(total * 100) / 100;
}

// ── CRUD ─────────────────────────────────────────

// GET /api/timesheets
// Derive timesheet service (PAS/Homemaker/Respite) from an authorization record.
// Handles serviceCode === 'TIMESHEETS' by falling back to serviceName-based matching.
function deriveTimesheetService(auth) {
    const code = auth.serviceCode;
    if (code === 'PCS' || code === 'PAS') return 'PAS';
    if (code === 'S5130') return 'Homemaker';
    if (code === 'S5150') return 'Respite';
    if (code === 'TIMESHEETS' || !code) {
        const name = (auth.serviceName || '').toLowerCase();
        if (name === 'pas' || name === 'pca' || (name.includes('personal') && name.includes('care'))) return 'PAS';
        if (name === 'hm' || name.includes('homemaker')) return 'Homemaker';
        if (name.includes('respite')) return 'Respite';
    }
    return null;
}

async function listTimesheets(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        if (req.query.status) where.status = req.query.status;
        if (req.query.weekStart) {
            const [y, m, d] = req.query.weekStart.split('-').map(Number);
            where.weekStart = new Date(Date.UTC(y, m - 1, d));
        }
        const timesheets = await prisma.timesheet.findMany({
            where,
            include: { client: { select: { id: true, clientName: true } }, entries: true },
            orderBy: { weekStart: 'desc' },
        });

        // Build auth limits per client, filtered by each timesheet's week dates
        const clientIds = [...new Set(timesheets.map(t => t.clientId).filter(Boolean))];
        const auths = clientIds.length > 0 ? await prisma.authorization.findMany({
            where: { clientId: { in: clientIds } },
            select: { clientId: true, serviceCode: true, serviceName: true, authorizedUnits: true, authorizationStartDate: true, authorizationEndDate: true },
        }) : [];
        // Group all auths by clientId for efficient per-timesheet filtering
        const authsByClientId = {};
        for (const a of auths) {
            if (!authsByClientId[a.clientId]) authsByClientId[a.clientId] = [];
            authsByClientId[a.clientId].push(a);
        }

        const enriched = timesheets.map(ts => {
            if (!ts.clientId || !authsByClientId[ts.clientId]) {
                return { ...ts, authLimits: null };
            }
            // Filter auths to those active during this timesheet's week
            const wsDate = new Date(ts.weekStart);
            const weDate = new Date(wsDate);
            weDate.setUTCDate(weDate.getUTCDate() + 6);
            const activeAuths = filterAuthsByWeek(authsByClientId[ts.clientId], wsDate, weDate);

            const limits = {};
            for (const a of activeAuths) {
                const svc = deriveTimesheetService(a);
                if (!svc) continue;
                limits[svc] = (limits[svc] || 0) + (a.authorizedUnits || 0);
            }
            return { ...ts, authLimits: Object.keys(limits).length > 0 ? limits : null };
        });

        res.json(enriched);
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
    res.json({ adl: ADL_ACTIVITIES, iadl: IADL_ACTIVITIES, respite: RESPITE_ACTIVITIES });
}

// POST /api/timesheets
async function createTimesheet(req, res, next) {
    try {
        const { clientId, pcaName, weekStart, clientPhone, clientIdNumber } = req.body;
        if (!clientId || !pcaName || !weekStart) {
            return res.status(400).json({ error: 'clientId, pcaName, weekStart are required' });
        }
        const [y, m, d] = weekStart.split('-').map(Number);
        const raw = new Date(Date.UTC(y, m - 1, d));
        // Snap to Sunday
        raw.setUTCDate(raw.getUTCDate() - raw.getUTCDay());
        const ws = raw;
        const cId = Number(clientId);
        const pName = pcaName.trim();

        // Check for existing timesheet (active or archived)
        const existing = await prisma.timesheet.findFirst({
            where: { clientId: cId, pcaName: pName, weekStart: ws },
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });

        if (existing) {
            if (existing.archivedAt) {
                // Archived — hard-delete it so we can create fresh
                await prisma.timesheetEntry.deleteMany({ where: { timesheetId: existing.id } });
                await prisma.timesheet.delete({ where: { id: existing.id } });
            } else {
                // Active — just return it instead of erroring
                return res.status(200).json(existing);
            }
        }

        // Compute dates for each day of the week
        const entries = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
            const date = new Date(ws);
            date.setUTCDate(ws.getUTCDate() + dow);
            return {
                dayOfWeek: dow,
                dateOfService: date.toISOString().split('T')[0],
            };
        });

        const ts = await prisma.timesheet.create({
            data: {
                clientId: cId,
                pcaName: pName,
                weekStart: ws,
                clientPhone: (clientPhone || '').trim(),
                clientIdNumber: (clientIdNumber || '').trim(),
                entries: { create: entries },
            },
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'CREATE', entityType: 'Timesheet', entityId: ts.id,
            entityName: `${ts.pcaName} - ${ts.client?.clientName || ''}`,
            metadata: { weekStart: ts.weekStart },
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
        if ((existing.status === 'submitted' || existing.status === 'accepted') && (!req.user || req.user.role !== 'admin')) {
            return res.status(400).json({ error: 'Cannot edit a submitted or accepted timesheet' });
        }

        const { entries, recipientName, recipientSignature, pcaSignature, pcaFullName, supervisorSignature, completionDate, clientPhone, clientIdNumber } = req.body;

        let totalPasHours = 0;
        let totalHmHours = 0;
        let totalRespiteHours = 0;

        if (entries && Array.isArray(entries)) {
            for (const entry of entries) {
                const adlHours = computeTotalHoursWithBlocks(entry.adlTimeIn, entry.adlTimeOut, entry.adlTimeBlocks);
                const iadlHours = computeTotalHoursWithBlocks(entry.iadlTimeIn, entry.iadlTimeOut, entry.iadlTimeBlocks);
                const respiteHours = computeTotalHoursWithBlocks(entry.respiteTimeIn, entry.respiteTimeOut, entry.respiteTimeBlocks);
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
                        adlTimeBlocks: entry.adlTimeBlocks || '[]',
                        adlPcaInitials: (entry.adlPcaInitials || '').trim(),
                        adlClientInitials: (entry.adlClientInitials || '').trim(),
                        iadlActivities: typeof entry.iadlActivities === 'string' ? entry.iadlActivities : JSON.stringify(entry.iadlActivities || {}),
                        iadlTimeIn: entry.iadlTimeIn || null,
                        iadlTimeOut: entry.iadlTimeOut || null,
                        iadlHours,
                        iadlTimeBlocks: entry.iadlTimeBlocks || '[]',
                        iadlPcaInitials: (entry.iadlPcaInitials || '').trim(),
                        iadlClientInitials: (entry.iadlClientInitials || '').trim(),
                        respiteActivities: typeof entry.respiteActivities === 'string' ? entry.respiteActivities : JSON.stringify(entry.respiteActivities || {}),
                        respiteTimeIn: entry.respiteTimeIn || null,
                        respiteTimeOut: entry.respiteTimeOut || null,
                        respiteHours,
                        respiteTimeBlocks: entry.respiteTimeBlocks || '[]',
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
        const changes = audit.diffFields(existing, ts, ['totalPasHours', 'totalHmHours', 'totalRespiteHours', 'totalHours']);
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'Timesheet', entityId: ts.id,
            entityName: ts.pcaName,
            changes,
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
        if (existing.status === 'submitted' || existing.status === 'accepted') return res.status(400).json({ error: 'Already submitted' });

        const ts = await prisma.timesheet.update({
            where: { id },
            data: { status: 'submitted', submittedAt: new Date() },
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'SUBMIT', entityType: 'Timesheet', entityId: ts.id,
            entityName: `${ts.pcaName} - ${ts.client?.clientName || ''}`,
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
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'ARCHIVE', entityType: 'Timesheet', entityId: id,
            entityName: `${existing.pcaName}`,
        });
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
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'RESTORE', entityType: 'Timesheet', entityId: id,
        });
        res.json(restored);
    } catch (err) { next(err); }
}

// DELETE /api/timesheets/:id/permanent — hard delete (admin only, archived timesheets only)
async function permanentlyDeleteTimesheet(req, res, next) {
    try {
        const id = Number(req.params.id);
        const existing = await prisma.timesheet.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Timesheet not found' });
        if (!existing.archivedAt) return res.status(400).json({ error: 'Only archived timesheets can be permanently deleted' });
        await prisma.timesheetEntry.deleteMany({ where: { timesheetId: id } });
        await prisma.timesheet.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PERMANENT_DELETE', entityType: 'Timesheet', entityId: id, entityName: existing.pcaName });
        res.json({ success: true });
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

        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 14, bottom: 14, left: 14, right: 14 } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="timesheet-${ts.id}.pdf"`);
        doc.pipe(res);

        const mL = 14;
        const pageW = doc.page.width - 28;
        const pageBottom = doc.page.height - 14;
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

        const labelW = 110;
        const totalsW = 50;
        const dayW = (pageW - labelW - totalsW) / 7;
        let gridY;

        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const fmtD = (d) => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });

        // ── Header box ──
        const headerH = 32;
        doc.save().rect(mL, mL, pageW, headerH).lineWidth(1).strokeColor('#1e3a5f').stroke().restore();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f').text('NV BEST PCA', mL + 6, mL + 4);
        doc.fontSize(5.5).font('Helvetica').fillColor('#666').text('PCA Service Delivery Record', mL + 6, mL + 16);

        const infoX = 160;
        const infoY = mL + 6;
        doc.fontSize(6).font('Helvetica').fillColor('#333');
        doc.font('Helvetica-Bold').text('Client:', infoX, infoY, { continued: true }).font('Helvetica').text(` ${ts.client?.clientName || ''}`);
        doc.font('Helvetica-Bold').text('Medicaid ID:', infoX, infoY + 9, { continued: true }).font('Helvetica').text(` ${ts.client?.medicaidId || ''}`);
        doc.font('Helvetica-Bold').text('PCA:', infoX + 200, infoY, { continued: true }).font('Helvetica').text(` ${ts.pcaName || ''}`);
        doc.font('Helvetica-Bold').text('Week:', infoX + 200, infoY + 9, { continued: true }).font('Helvetica').text(` ${fmtD(weekStart)} - ${fmtD(weekEnd)}`);

        const statusX = pageW - 60;
        const statusLabel = ts.status === 'accepted' ? 'Accepted' : ts.status === 'submitted' ? 'Submitted' : ts.status === 'rejected' ? 'Rejected' : 'Draft';
        const statusColor = ts.status === 'accepted' ? '#16a34a' : ts.status === 'rejected' ? '#dc2626' : '#1e3a5f';
        doc.fontSize(7).font('Helvetica-Bold').fillColor(statusColor).text(statusLabel, statusX, infoY + 4);

        gridY = mL + headerH + 4;

        // ── Draw a compact grid row ──
        const drawRow = (label, values, opts = {}) => {
            const { bold, bg, textColor, height, sectionHeader, fontSize, totalsVal } = {
                bold: false, bg: null, textColor: '#000', height: 10, sectionHeader: false, fontSize: 6, totalsVal: '', ...opts
            };

            if (gridY + height > pageBottom) {
                doc.addPage();
                gridY = 14;
            }

            if (bg) {
                doc.save().rect(mL, gridY, pageW, height).fill(bg).restore();
            }
            doc.save().rect(mL, gridY, pageW, height).lineWidth(0.3).stroke('#ccc').restore();

            doc.save().lineWidth(0.2).strokeColor('#ccc');
            doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + height).stroke();
            for (let i = 1; i < 7; i++) {
                const x = mL + labelW + (i * dayW);
                doc.moveTo(x, gridY).lineTo(x, gridY + height).stroke();
            }
            doc.moveTo(mL + labelW + 7 * dayW, gridY).lineTo(mL + labelW + 7 * dayW, gridY + height).stroke();
            doc.restore();

            const textY = gridY + (height - fontSize) / 2;
            doc.fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(textColor);

            if (sectionHeader) {
                doc.text(label, mL + 4, textY, { width: pageW - 8 });
            } else {
                doc.text(label, mL + 2, textY, { width: labelW - 4, lineBreak: false });
                for (let i = 0; i < 7; i++) {
                    const val = values[i] || '';
                    const x = mL + labelW + (i * dayW);
                    doc.text(String(val), x + 1, textY, { width: dayW - 2, align: 'center', lineBreak: false });
                }
                if (totalsVal) {
                    const tx = mL + labelW + 7 * dayW;
                    doc.font('Helvetica-Bold').text(String(totalsVal), tx + 1, textY, { width: totalsW - 4, align: 'center', lineBreak: false });
                }
            }

            gridY += height;
        };

        // ── Day column header ──
        drawRow('SERVICE / TASKS', dayNames.map((d, i) => {
            const e = ts.entries[i];
            const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '';
            return `${d} ${dateStr}`;
        }), { bold: true, bg: '#1e3a5f', textColor: '#fff', height: 11, totalsVal: 'TOTALS' });

        // ── Helper: compute section total hours ──
        const sectionTotal = (section) => {
            return ts.entries.reduce((sum, e) => sum + (e[`${section}Hours`] || 0), 0);
        };

        // ── Helper: draw time rows (merged In/Out on one line per shift) ──
        const drawShiftRows = (section) => {
            let maxShifts = 1;
            for (const e of ts.entries) {
                const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                if (blocks.length + 1 > maxShifts) maxShifts = blocks.length + 1;
            }

            for (let s = 0; s < maxShifts; s++) {
                const shiftLabel = `Shift ${s + 1} (In / Out)`;
                const vals = ts.entries.map(e => {
                    let timeIn, timeOut;
                    if (s === 0) {
                        timeIn = hhmm12(e[`${section}TimeIn`]);
                        timeOut = hhmm12(e[`${section}TimeOut`]);
                    } else {
                        const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                        timeIn = hhmm12(blocks[s - 1]?.in);
                        timeOut = hhmm12(blocks[s - 1]?.out);
                    }
                    if (!timeIn && !timeOut) return '';
                    return `${timeIn || '-'} / ${timeOut || '-'}`;
                });
                drawRow(shiftLabel, vals, { fontSize: 4.5, bg: '#fafafa' });
            }
        };

        // ── PAS Section ──
        const pasTotal = sectionTotal('adl');
        drawRow('PAS (Personal Assistance Services)', [], { bold: true, bg: '#dbeafe', height: 10, sectionHeader: true });
        for (const act of ADL_ACTIVITIES) {
            const vals = ts.entries.map(e => {
                const activities = JSON.parse(e.adlActivities || '{}');
                return activities[act] ? 'X' : '';
            });
            drawRow(act, vals);
        }
        drawRow('PCA Initials', ts.entries.map(e => e.adlPcaInitials || ''), { bg: '#f8f8f8' });
        drawRow('Client Initials', ts.entries.map(e => e.adlClientInitials || ''));
        drawShiftRows('adl');
        drawRow('Hours', ts.entries.map(e => e.adlHours > 0 ? e.adlHours.toFixed(1) : ''), { bold: true, bg: '#eff6ff', totalsVal: pasTotal > 0 ? pasTotal.toFixed(2) : '' });

        // ── Homemaker Section ──
        const hmTotal = sectionTotal('iadl');
        drawRow('Homemaker (IADL Services)', [], { bold: true, bg: '#dcfce7', height: 10, sectionHeader: true });
        for (const act of IADL_ACTIVITIES) {
            const vals = ts.entries.map(e => {
                const activities = JSON.parse(e.iadlActivities || '{}');
                return activities[act] ? 'X' : '';
            });
            drawRow(act, vals);
        }
        drawRow('PCA Initials', ts.entries.map(e => e.iadlPcaInitials || ''), { bg: '#f8f8f8' });
        drawRow('Client Initials', ts.entries.map(e => e.iadlClientInitials || ''));
        drawShiftRows('iadl');
        drawRow('Hours', ts.entries.map(e => e.iadlHours > 0 ? e.iadlHours.toFixed(1) : ''), { bold: true, bg: '#f0fdf4', totalsVal: hmTotal > 0 ? hmTotal.toFixed(2) : '' });

        // ── Respite Section ──
        const respTotal = sectionTotal('respite');
        const hasRespite = respTotal > 0 || ts.entries.some(e => {
            try { const a = JSON.parse(e.respiteActivities || '{}'); return Object.values(a).some(Boolean); } catch { return false; }
        });
        if (hasRespite) {
            drawRow('Respite (Respite Services)', [], { bold: true, bg: '#fff7ed', height: 10, sectionHeader: true });
            for (const act of RESPITE_ACTIVITIES) {
                const vals = ts.entries.map(e => {
                    const activities = JSON.parse(e.respiteActivities || '{}');
                    return activities[act] ? 'X' : '';
                });
                drawRow(act, vals);
            }
            drawRow('PCA Initials', ts.entries.map(e => e.respitePcaInitials || ''), { bg: '#f8f8f8' });
            drawRow('Client Initials', ts.entries.map(e => e.respiteClientInitials || ''));
            drawShiftRows('respite');
            drawRow('Hours', ts.entries.map(e => e.respiteHours > 0 ? e.respiteHours.toFixed(1) : ''), { bold: true, bg: '#fff7ed', totalsVal: respTotal > 0 ? respTotal.toFixed(2) : '' });
        }

        // ── Daily Totals bar ──
        gridY += 1;
        const dailyTotals = ts.entries.map(e => {
            const h = (e.adlHours || 0) + (e.iadlHours || 0) + (e.respiteHours || 0);
            return h > 0 ? h.toFixed(1) : '';
        });
        const weekTotal = (ts.totalHours || 0).toFixed(2);
        drawRow('DAILY TOTAL (All Programs)', dailyTotals, { bold: true, bg: '#1e3a5f', textColor: '#fff', height: 11, totalsVal: weekTotal });

        // ── Signatures ──
        gridY += 6;
        if (gridY + 40 > pageBottom) { doc.addPage(); gridY = 14; }

        const sigW = (pageW - 30) / 3;
        const sigH = 22;
        const sigCol1 = mL;
        const sigCol2 = mL + sigW + 15;
        const sigCol3 = mL + 2 * (sigW + 15);

        doc.fontSize(6).font('Helvetica-Bold').fillColor('#333');
        doc.text('PCA / EMPLOYEE', sigCol1, gridY);
        doc.text('RECIPIENT / CLIENT', sigCol2, gridY);
        doc.text('SUPERVISOR', sigCol3, gridY);
        gridY += 8;

        doc.fontSize(5.5).font('Helvetica').fillColor('#000');
        doc.text(ts.pcaFullName || ts.pcaName || '', sigCol1, gridY);
        doc.text(ts.recipientName || ts.client?.clientName || '', sigCol2, gridY);
        doc.text(ts.supervisorName || 'Sona Hakobyan', sigCol3, gridY);
        gridY += 8;

        if (ts.pcaSignature) {
            try { doc.image(ts.pcaSignature, sigCol1, gridY, { width: sigW - 10, height: sigH }); } catch { /* skip */ }
        }
        if (ts.recipientSignature) {
            try { doc.image(ts.recipientSignature, sigCol2, gridY, { width: sigW - 10, height: sigH }); } catch { /* skip */ }
        }
        if (ts.supervisorSignature) {
            try { doc.image(ts.supervisorSignature, sigCol3, gridY, { width: sigW - 10, height: sigH }); } catch { /* skip */ }
        }

        gridY += sigH + 2;
        doc.save().lineWidth(0.5).strokeColor('#333');
        doc.moveTo(sigCol1, gridY).lineTo(sigCol1 + sigW - 10, gridY).stroke();
        doc.moveTo(sigCol2, gridY).lineTo(sigCol2 + sigW - 10, gridY).stroke();
        doc.moveTo(sigCol3, gridY).lineTo(sigCol3 + sigW - 10, gridY).stroke();
        doc.restore();

        gridY += 3;
        doc.fontSize(5).fillColor('#666');
        doc.text('Signature', sigCol1, gridY);
        doc.text('Signature', sigCol2, gridY);
        doc.text('Signature', sigCol3, gridY);

        if (ts.completionDate) {
            doc.fontSize(5).fillColor('#333').text(`Date: ${ts.completionDate}`, sigCol1, gridY + 8);
        }

        doc.end();
    } catch (err) { next(err); }
}

// PUT /api/timesheets/:id/status
async function updateTimesheetStatus(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { status } = req.body;
        if (!['draft', 'submitted', 'accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const existing = await prisma.timesheet.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Timesheet not found' });

        const data = { status };
        if (status === 'rejected') {
            data.status = 'draft';
        }
        if (status === 'accepted') {
            data.acceptedAt = new Date();
        }

        const ts = await prisma.timesheet.update({
            where: { id },
            data,
            include: { client: { select: { id: true, clientName: true } }, entries: { orderBy: { dayOfWeek: 'asc' } } },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'Timesheet', entityId: ts.id,
            entityName: `${ts.pcaName} - ${ts.client?.clientName || ''}`,
            changes: [{ field: 'status', oldValue: existing.status, newValue: status === 'rejected' ? 'draft (rejected)' : status }],
        });
        res.json(ts);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Timesheet not found' });
        next(err);
    }
}

async function bulkPermanentlyDeleteTimesheets(req, res, next) {
    try {
        const result = await prisma.timesheet.deleteMany({ where: { archivedAt: { not: null } } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'BULK_DELETE', entityType: 'Timesheet', entityId: 0, metadata: { count: result.count } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

module.exports = { listTimesheets, getTimesheet, getActivities, createTimesheet, updateTimesheet, submitTimesheet, deleteTimesheet, restoreTimesheet, permanentlyDeleteTimesheet, bulkPermanentlyDeleteTimesheets, exportTimesheetPdf, updateTimesheetStatus };
