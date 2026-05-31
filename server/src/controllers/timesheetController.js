const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const { filterAuthsByWeek } = require('../services/authorizationService');

// ── Activity definitions (match the paper form) ──────
const ADL_ACTIVITIES = [
    'Bathing', 'Dressing', 'Grooming', 'Toileting',
    'Ambulation/Mobility', 'Transfer', 'Eating/Feeding',
];
const IADL_ACTIVITIES = [
    'Light Housekeeping', 'Laundry', 'Shopping',
    'Meal Preparation', 'Other',
];
const RESPITE_ACTIVITIES = [
    'Companionship', 'Safety Supervision',
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

        let authLimits = null;
        if (ts.clientId) {
            const auths = await prisma.authorization.findMany({
                where: { clientId: ts.clientId },
                select: { serviceCode: true, serviceName: true, authorizedUnits: true, authorizationStartDate: true, authorizationEndDate: true },
            });
            const wsDate = new Date(ts.weekStart);
            const weDate = new Date(wsDate);
            weDate.setUTCDate(weDate.getUTCDate() + 6);
            const activeAuths = filterAuthsByWeek(auths, wsDate, weDate);
            const limits = {};
            for (const a of activeAuths) {
                const svc = deriveTimesheetService(a);
                if (!svc) continue;
                limits[svc] = (limits[svc] || 0) + (a.authorizedUnits || 0);
            }
            if (Object.keys(limits).length > 0) authLimits = limits;
        }

        res.json({ ...ts, authLimits });
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

        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 12, bottom: 12, left: 12, right: 12 } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="timesheet-${ts.id}.pdf"`);
        doc.pipe(res);

        const mL = 12;
        const pageW = doc.page.width - 24;
        const pageH = doc.page.height - 24;
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

        const labelW = 200;
        const totalsW = 70;
        const dayW = (pageW - labelW - totalsW) / 7;
        let gridY;

        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const fmtDateShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

        const navy = '#1e3a5f';
        const blue = '#1e40af';
        const green = '#16a34a';
        const orange = '#ea580c';

        // ── Header ──
        const headerH = 44;
        doc.save().rect(mL, mL, pageW, headerH).lineWidth(1.5).strokeColor(navy).stroke().restore();

        // Logo area (left section)
        const logoSectionW = 220;
        doc.save().moveTo(mL + logoSectionW, mL).lineTo(mL + logoSectionW, mL + headerH).lineWidth(0.5).strokeColor(navy).stroke().restore();
        doc.fontSize(14).font('Helvetica-Bold').fillColor(navy).text('NV BEST PCA', mL + 40, mL + 8);
        doc.fontSize(7).font('Helvetica').fillColor('#555').text('PCA Service Delivery Record', mL + 40, mL + 24);

        // Info cells
        const infoCellW = (pageW - logoSectionW) / 4;
        for (let i = 1; i < 4; i++) {
            const x = mL + logoSectionW + infoCellW * i;
            doc.save().moveTo(x, mL).lineTo(x, mL + headerH).lineWidth(0.5).strokeColor(navy).stroke().restore();
        }

        const cell1X = mL + logoSectionW + 8;
        const cell2X = mL + logoSectionW + infoCellW + 8;
        const cell3X = mL + logoSectionW + infoCellW * 2 + 8;
        const cell4X = mL + logoSectionW + infoCellW * 3 + 8;

        doc.fontSize(6).fillColor('#666').font('Helvetica');
        doc.text('Client:', cell1X, mL + 6);
        doc.text('Medicaid ID:', cell1X, mL + 22);
        doc.text('Caregiver / PCA:', cell2X, mL + 6);
        doc.text('Week:', cell2X, mL + 22);
        doc.text('Date Submitted:', cell3X, mL + 6);
        doc.text('Status:', cell4X, mL + 6);

        doc.fontSize(8).fillColor('#000').font('Helvetica-Bold');
        doc.text(ts.client?.clientName || '', cell1X + 30, mL + 5);
        doc.text(ts.client?.medicaidId || '', cell1X + 55, mL + 21);
        doc.text(ts.pcaName || '', cell2X + 70, mL + 5);

        const weekRangeStr = `${fmtDateShort(weekStart)} – ${fmtDate(weekEnd)}`;
        doc.fontSize(7).text(weekRangeStr, cell2X + 25, mL + 21);
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('(Sun – Sat)', cell2X + 25, mL + 31);

        if (ts.submittedAt) {
            const subDate = new Date(ts.submittedAt);
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(
                subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
                subDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                cell3X, mL + 16
            );
        }

        // Status badge
        const statusLabel = ts.status === 'accepted' ? 'Accepted' : ts.status === 'submitted' ? 'Submitted' : ts.status === 'rejected' ? 'Rejected' : 'Draft';
        const statusColor = ts.status === 'accepted' ? green : ts.status === 'submitted' ? green : ts.status === 'rejected' ? '#dc2626' : navy;
        doc.fontSize(7).font('Helvetica-Bold').fillColor(statusColor).text(statusLabel, cell4X + 4, mL + 20);

        gridY = mL + headerH + 4;

        // ── Column header bar ──
        const colHeaderH = 24;
        doc.save().rect(mL, gridY, pageW, colHeaderH).fill(navy).restore();
        doc.save().rect(mL, gridY, pageW, colHeaderH).lineWidth(0.5).stroke(navy).restore();

        const colTextY = gridY + 4;
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#fff');
        doc.text('SERVICE TYPES (PROGRAMS) / ACTIVITIES', mL + 6, colTextY + 4, { width: labelW - 12 });

        for (let i = 0; i < 7; i++) {
            const e = ts.entries[i];
            const x = mL + labelW + i * dayW;
            const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            doc.fontSize(7).font('Helvetica-Bold').text(dayNames[i], x, colTextY + 2, { width: dayW, align: 'center' });
            doc.fontSize(6).font('Helvetica').text(dateStr, x, colTextY + 11, { width: dayW, align: 'center' });
        }
        doc.fontSize(7).font('Helvetica-Bold').text('TOTALS', mL + labelW + 7 * dayW, colTextY + 5, { width: totalsW, align: 'center' });

        // Vertical lines in header
        doc.save().lineWidth(0.3).strokeColor('rgba(255,255,255,0.3)');
        doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + colHeaderH).stroke();
        for (let i = 1; i < 7; i++) {
            doc.moveTo(mL + labelW + i * dayW, gridY).lineTo(mL + labelW + i * dayW, gridY + colHeaderH).stroke();
        }
        doc.moveTo(mL + labelW + 7 * dayW, gridY).lineTo(mL + labelW + 7 * dayW, gridY + colHeaderH).stroke();
        doc.restore();

        gridY += colHeaderH;

        // ── Row drawing helper ──
        const ROW_H = 13;
        const drawRow = (label, values, opts = {}) => {
            const { bold, bg, textColor, height, fontSize, labelColor, emDash } = {
                bold: false, bg: null, textColor: '#333', height: ROW_H, fontSize: 7, labelColor: '#333', emDash: false, ...opts
            };

            if (bg) {
                doc.save().rect(mL, gridY, pageW, height).fill(bg).restore();
            }

            // Grid lines
            doc.save().lineWidth(0.2).strokeColor('#ddd');
            doc.moveTo(mL, gridY + height).lineTo(mL + pageW, gridY + height).stroke();
            doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + height).stroke();
            for (let i = 1; i < 7; i++) {
                doc.moveTo(mL + labelW + i * dayW, gridY).lineTo(mL + labelW + i * dayW, gridY + height).stroke();
            }
            doc.moveTo(mL + labelW + 7 * dayW, gridY).lineTo(mL + labelW + 7 * dayW, gridY + height).stroke();
            doc.restore();

            const textY = gridY + (height - fontSize * 1.1) / 2;
            doc.fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(labelColor);
            doc.text(label, mL + 6, textY, { width: labelW - 12, lineBreak: false });

            doc.fillColor(textColor);
            for (let i = 0; i < 7; i++) {
                let val = values[i] || '';
                if (emDash && !val) val = '—';
                const x = mL + labelW + i * dayW;
                doc.fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica');
                doc.text(String(val), x, textY, { width: dayW, align: 'center', lineBreak: false });
            }

            gridY += height;
        };

        // ── Checkbox helper (draws a square, filled if checked) ──
        const drawCheckboxRow = (label, checkedArr, checkColor) => {
            const height = ROW_H;
            doc.save().lineWidth(0.2).strokeColor('#ddd');
            doc.moveTo(mL, gridY + height).lineTo(mL + pageW, gridY + height).stroke();
            doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + height).stroke();
            for (let i = 1; i < 7; i++) {
                doc.moveTo(mL + labelW + i * dayW, gridY).lineTo(mL + labelW + i * dayW, gridY + height).stroke();
            }
            doc.moveTo(mL + labelW + 7 * dayW, gridY).lineTo(mL + labelW + 7 * dayW, gridY + height).stroke();
            doc.restore();

            const textY = gridY + (height - 7) / 2;
            doc.fontSize(7).font('Helvetica').fillColor('#333');
            doc.text(label, mL + 30, textY, { width: labelW - 36, lineBreak: false });

            const boxSize = 7;
            const boxY = gridY + (height - boxSize) / 2;
            for (let i = 0; i < 7; i++) {
                const cx = mL + labelW + i * dayW + (dayW - boxSize) / 2;
                if (checkedArr[i]) {
                    doc.save().rect(cx, boxY, boxSize, boxSize).fill(checkColor).restore();
                    doc.save().rect(cx, boxY, boxSize, boxSize).lineWidth(0.3).stroke(checkColor).restore();
                    // White checkmark
                    doc.save().strokeColor('#fff').lineWidth(1);
                    doc.moveTo(cx + 1.5, boxY + 3.5).lineTo(cx + 3, boxY + 5.5).lineTo(cx + 5.5, boxY + 1.5).stroke();
                    doc.restore();
                } else {
                    doc.save().rect(cx, boxY, boxSize, boxSize).lineWidth(0.5).stroke('#999').restore();
                }
            }

            gridY += height;
        };

        // ── Section totals column helper ──
        const drawSectionTotals = (hours, units, color) => {
            const totH = 36;
            const tx = mL + labelW + 7 * dayW;
            const ty = gridY - totH;
            // Draw the totals in the right column area (already positioned)
            doc.save();
            doc.rect(tx, gridY, totalsW, 0); // placeholder
            doc.restore();
        };

        // ── Draw section with totals ──
        const drawProgramSection = (sectionName, subtitle, activities, section, color, sectionBg) => {
            const sectionStartY = gridY;

            // Section header row
            const headerRowH = ROW_H + 2;
            doc.save().lineWidth(0.2).strokeColor('#ddd');
            doc.moveTo(mL, gridY + headerRowH).lineTo(mL + pageW, gridY + headerRowH).stroke();
            doc.restore();

            // Section icon circle
            const iconR = 7;
            const iconCx = mL + 14;
            const iconCy = gridY + headerRowH / 2;
            doc.save().circle(iconCx, iconCy, iconR).fill(color === blue ? '#dbeafe' : color === green ? '#dcfce7' : '#fff7ed').restore();
            doc.save().circle(iconCx, iconCy, iconR).lineWidth(0.5).stroke(color).restore();

            // Section name
            const nameY = gridY + (headerRowH - 9) / 2;
            doc.fontSize(10).font('Helvetica-Bold').fillColor(color);
            doc.text(sectionName, mL + 26, nameY - 1, { continued: true, lineBreak: false });
            doc.fontSize(6.5).font('Helvetica').fillColor('#666');
            doc.text(`  (${subtitle})`, { lineBreak: false });

            gridY += headerRowH;

            // Activity checkbox rows
            for (const act of activities) {
                const checkedArr = ts.entries.map(e => {
                    const acts = JSON.parse(e[`${section}Activities`] || '{}');
                    return !!acts[act];
                });
                drawCheckboxRow(act, checkedArr, color);
            }

            // PCA Initials
            drawRow('PCA Initials', ts.entries.map(e => e[`${section}PcaInitials`] || ''), { bold: true, emDash: true });
            // Client Initials
            drawRow('Client Initials', ts.entries.map(e => e[`${section}ClientInitials`] || ''), { bold: true, emDash: true });

            // Shift rows (Time In / Out combined)
            let maxShifts = 1;
            for (const e of ts.entries) {
                const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                if (blocks.length + 1 > maxShifts) maxShifts = blocks.length + 1;
            }
            for (let s = 0; s < maxShifts; s++) {
                const shiftLabel = `Shift ${s + 1} (Time In / Out)`;
                const vals = ts.entries.map(e => {
                    let ti, to;
                    if (s === 0) {
                        ti = hhmm12(e[`${section}TimeIn`]);
                        to = hhmm12(e[`${section}TimeOut`]);
                    } else {
                        const blocks = parseBlocks(e[`${section}TimeBlocks`]);
                        ti = hhmm12(blocks[s - 1]?.in);
                        to = hhmm12(blocks[s - 1]?.out);
                    }
                    if (!ti && !to) return '';
                    return `${ti} - ${to}`;
                });
                drawRow(shiftLabel, vals, { fontSize: 6, emDash: true });
            }

            // + Add Shift row
            drawRow('+ Add Shift', ts.entries.map(() => ''), { fontSize: 6, labelColor: blue, emDash: true });

            const sectionEndY = gridY;

            // Draw TOTALS column content for this section
            const totalHours = ts.entries.reduce((sum, e) => sum + (e[`${section}Hours`] || 0), 0);
            const totalUnits = Math.round(totalHours * 4);
            const tx = mL + labelW + 7 * dayW;
            const totMidY = sectionStartY + (sectionEndY - sectionStartY) / 2;

            // Hours label + value
            doc.fontSize(6).font('Helvetica-Bold').fillColor(color);
            doc.text('Hours', tx + 8, totMidY - 14, { width: totalsW - 16 });
            doc.fontSize(14).text(totalHours.toFixed(2), tx + 4, totMidY - 5, { width: totalsW - 8, align: 'center' });

            // Units label + value
            doc.fontSize(6).fillColor('#333');
            doc.text('Units', tx + 8, totMidY + 12, { width: totalsW - 16 });
            doc.fontSize(11).font('Helvetica-Bold').text(String(totalUnits), tx + 4, totMidY + 20, { width: totalsW - 8, align: 'center' });

            // Section divider (white space)
            gridY += 2;
        };

        // ── Render sections ──
        drawProgramSection('PAS', 'Personal Assistance Services', ADL_ACTIVITIES, 'adl', blue, '#dbeafe');
        drawProgramSection('Homemaker', 'IADL Services', IADL_ACTIVITIES, 'iadl', green, '#dcfce7');

        const hasRespite = (ts.totalRespiteHours || 0) > 0 || ts.entries.some(e => {
            try { const a = JSON.parse(e.respiteActivities || '{}'); return Object.values(a).some(Boolean); } catch { return false; }
        });
        if (hasRespite) {
            drawProgramSection('Respite', 'Respite Services', RESPITE_ACTIVITIES, 'respite', orange, '#fff7ed');
        }

        // ── Daily Totals bar ──
        const dailyBarH = 22;
        doc.save().rect(mL, gridY, pageW, dailyBarH).fill(navy).restore();

        doc.save().lineWidth(0.3).strokeColor('rgba(255,255,255,0.3)');
        doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + dailyBarH).stroke();
        for (let i = 1; i < 7; i++) {
            doc.moveTo(mL + labelW + i * dayW, gridY).lineTo(mL + labelW + i * dayW, gridY + dailyBarH).stroke();
        }
        doc.moveTo(mL + labelW + 7 * dayW, gridY).lineTo(mL + labelW + 7 * dayW, gridY + dailyBarH).stroke();
        doc.restore();

        // Label
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#fff');
        doc.text('DAILY TOTAL', mL + 8, gridY + 4, { width: labelW - 16 });
        doc.fontSize(5.5).text('(All Programs)', mL + 8, gridY + 13, { width: labelW - 16 });

        // Daily values
        for (let i = 0; i < 7; i++) {
            const e = ts.entries[i];
            const dayH = (e?.adlHours || 0) + (e?.iadlHours || 0) + (e?.respiteHours || 0);
            const dayU = Math.round(dayH * 4);
            const x = mL + labelW + i * dayW;
            if (dayH > 0) {
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
                doc.text(dayH.toFixed(2), x, gridY + 3, { width: dayW, align: 'center' });
                doc.fontSize(6).font('Helvetica').text(`${dayU} Units`, x, gridY + 13, { width: dayW, align: 'center' });
            } else {
                doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.5)');
                doc.text('—', x, gridY + 6, { width: dayW, align: 'center' });
            }
        }

        // Week total (right column)
        const wtX = mL + labelW + 7 * dayW;
        doc.save().rect(wtX, gridY, totalsW, dailyBarH).fill('#16a34a').restore();
        doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#fff');
        doc.text('WEEK TOTAL', wtX + 4, gridY + 2, { width: totalsW - 8, align: 'center' });
        doc.fontSize(8).text(`${(ts.totalHours || 0).toFixed(2)} Hours`, wtX + 4, gridY + 9, { width: totalsW - 8, align: 'center' });
        doc.fontSize(6).text(`${Math.round((ts.totalHours || 0) * 4)} Units`, wtX + 4, gridY + 18, { width: totalsW - 8, align: 'center' });

        gridY += dailyBarH + 6;

        // ── Signature section ──
        if (gridY + 55 > pageH + 12) { doc.addPage(); gridY = 12; }

        const sigBoxH = 52;
        doc.save().rect(mL, gridY, pageW, sigBoxH).lineWidth(0.5).stroke('#ccc').restore();

        const sigColW = pageW / 4;
        for (let i = 1; i < 4; i++) {
            doc.save().moveTo(mL + sigColW * i, gridY).lineTo(mL + sigColW * i, gridY + sigBoxH).lineWidth(0.5).stroke('#ccc').restore();
        }

        const sigPad = 6;
        const sig1X = mL + sigPad;
        const sig2X = mL + sigColW + sigPad;
        const sig3X = mL + sigColW * 2 + sigPad;
        const sig4X = mL + sigColW * 3 + sigPad;
        const sigContentW = sigColW - sigPad * 2;

        // Column 1: Caregiver / PCA
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#333');
        doc.text('Caregiver / PCA (Employee)', sig1X, gridY + 4, { width: sigContentW });
        if (ts.pcaSignature) {
            try { doc.image(ts.pcaSignature, sig1X, gridY + 14, { width: sigContentW * 0.7, height: 20 }); } catch {}
        }
        doc.save().moveTo(sig1X, gridY + 36).lineTo(sig1X + sigContentW, gridY + 36).lineWidth(0.5).stroke('#333').restore();
        doc.fontSize(6).font('Helvetica').fillColor('#555');
        doc.text(`Date: ${ts.completionDate || ''}`, sig1X, gridY + 40);

        // Column 2: Client / Recipient
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#333');
        doc.text('Client / Recipient', sig2X, gridY + 4, { width: sigContentW });
        if (ts.recipientSignature) {
            try { doc.image(ts.recipientSignature, sig2X, gridY + 14, { width: sigContentW * 0.7, height: 20 }); } catch {}
        }
        doc.save().moveTo(sig2X, gridY + 36).lineTo(sig2X + sigContentW, gridY + 36).lineWidth(0.5).stroke('#333').restore();
        doc.fontSize(6).font('Helvetica').fillColor('#555');
        doc.text(`Date: ${ts.completionDate || ''}`, sig2X, gridY + 40);

        // Column 3: Supervisor
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#333');
        doc.text('Supervisor', sig3X, gridY + 4, { width: sigContentW });
        if (ts.supervisorSignature) {
            try { doc.image(ts.supervisorSignature, sig3X, gridY + 14, { width: sigContentW * 0.7, height: 20 }); } catch {}
        }
        doc.save().moveTo(sig3X, gridY + 36).lineTo(sig3X + sigContentW, gridY + 36).lineWidth(0.5).stroke('#333').restore();
        doc.fontSize(6).font('Helvetica').fillColor('#555');
        doc.text(`Date: ${ts.completionDate || ''}`, sig3X, gridY + 40);

        // Column 4: Office Use Only
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#333');
        doc.text('OFFICE USE ONLY', sig4X, gridY + 4, { width: sigContentW });
        doc.fontSize(6).font('Helvetica').fillColor('#555');
        doc.text('Accepted By: ___________________________', sig4X, gridY + 18, { width: sigContentW });
        doc.text('Date: _______________', sig4X + sigContentW * 0.6, gridY + 18, { width: sigContentW * 0.4 });
        doc.text('Comments: ________________________________________', sig4X, gridY + 32, { width: sigContentW });

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
