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

        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 14, bottom: 14, left: 14, right: 14 } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="timesheet-${ts.id}.pdf"`);
        doc.pipe(res);

        const mL = 14;
        const pageW = doc.page.width - 28;
        const pageBottom = doc.page.height - 14;

        const labelW = 190;
        const totalsW = 72;
        const dayW = (pageW - labelW - totalsW) / 7;
        let gridY = mL;

        const weekStart = new Date(ts.weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const fmtMDY = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const fmtMD = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

        const navy = '#1e3a5f';
        const blue = '#1e40af';
        const green = '#16a34a';
        const orange = '#ea580c';

        // ═══ HEADER ═══
        const headerH = 42;
        doc.save().rect(mL, gridY, pageW, headerH).lineWidth(1.5).strokeColor(navy).stroke().restore();

        // Logo section
        const logoW = 200;
        doc.save().moveTo(mL + logoW, gridY).lineTo(mL + logoW, gridY + headerH).lineWidth(0.5).strokeColor(navy).stroke().restore();
        doc.fontSize(13).font('Helvetica-Bold').fillColor(navy).text('NV BEST PCA', mL + 8, gridY + 7);
        doc.fontSize(6.5).font('Helvetica').fillColor('#555').text('PCA Service Delivery Record', mL + 8, gridY + 23);

        // Info cells (4 equal sections to the right of logo)
        const infoW = (pageW - logoW) / 4;
        for (let i = 1; i < 4; i++) {
            doc.save().moveTo(mL + logoW + infoW * i, gridY).lineTo(mL + logoW + infoW * i, gridY + headerH).lineWidth(0.5).strokeColor(navy).stroke().restore();
        }

        // Cell 1: Client + Medicaid
        const c1 = mL + logoW + 6;
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('Client:', c1, gridY + 5);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text(ts.client?.clientName || '', c1 + 28, gridY + 4);
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('Medicaid ID:', c1, gridY + 20);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text(ts.client?.medicaidId || '', c1 + 50, gridY + 19);

        // Cell 2: PCA + Week
        const c2 = mL + logoW + infoW + 6;
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('Caregiver / PCA:', c2, gridY + 5);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text(ts.pcaName || '', c2 + 65, gridY + 4);
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('Week:', c2, gridY + 20);
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text(`${fmtMD(weekStart)} – ${fmtMDY(weekEnd)}`, c2 + 24, gridY + 19);
        doc.fontSize(5.5).font('Helvetica').fillColor('#888').text('(Sun – Sat)', c2 + 24, gridY + 30);

        // Cell 3: Date Submitted
        const c3 = mL + logoW + infoW * 2 + 6;
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('Date Submitted:', c3, gridY + 5);
        if (ts.submittedAt) {
            const sd = new Date(ts.submittedAt);
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000').text(
                sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                c3, gridY + 16
            );
            doc.fontSize(6).font('Helvetica').fillColor('#555').text(
                sd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                c3, gridY + 28
            );
        }

        // Cell 4: Status
        const c4 = mL + logoW + infoW * 3 + 6;
        doc.fontSize(6).font('Helvetica').fillColor('#666').text('Status:', c4, gridY + 5);
        const statusLabel = ts.status === 'accepted' ? 'Accepted' : ts.status === 'submitted' ? 'Submitted' : ts.status === 'rejected' ? 'Rejected' : 'Draft';
        const statusColor = (ts.status === 'accepted' || ts.status === 'submitted') ? green : ts.status === 'rejected' ? '#dc2626' : navy;
        doc.fontSize(8).font('Helvetica-Bold').fillColor(statusColor).text(statusLabel, c4 + 10, gridY + 19);

        gridY += headerH + 3;

        // ═══ COLUMN HEADER BAR ═══
        const colH = 22;
        doc.save().rect(mL, gridY, pageW, colH).fill(navy).restore();

        doc.fontSize(6).font('Helvetica-Bold').fillColor('#fff');
        doc.text('SERVICE TYPES (PROGRAMS) / ACTIVITIES', mL + 6, gridY + 8, { width: labelW - 12 });

        for (let i = 0; i < 7; i++) {
            const e = ts.entries[i];
            const x = mL + labelW + i * dayW;
            const dayName = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][e?.dayOfWeek ?? i];
            const dateStr = e?.dateOfService ? new Date(e.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            doc.fontSize(7).font('Helvetica-Bold').text(dayName, x, gridY + 4, { width: dayW, align: 'center' });
            doc.fontSize(5.5).font('Helvetica').text(dateStr, x, gridY + 13, { width: dayW, align: 'center' });
        }
        doc.fontSize(6.5).font('Helvetica-Bold').text('TOTALS', mL + labelW + 7 * dayW, gridY + 8, { width: totalsW, align: 'center' });

        gridY += colH;

        // ═══ ROW HELPERS ═══
        const RH = 12;

        const gridLines = (y, h) => {
            doc.save().lineWidth(0.15).strokeColor('#ddd');
            doc.moveTo(mL, y + h).lineTo(mL + pageW, y + h).stroke();
            doc.moveTo(mL + labelW, y).lineTo(mL + labelW, y + h).stroke();
            for (let i = 1; i < 7; i++) doc.moveTo(mL + labelW + i * dayW, y).lineTo(mL + labelW + i * dayW, y + h).stroke();
            doc.moveTo(mL + labelW + 7 * dayW, y).lineTo(mL + labelW + 7 * dayW, y + h).stroke();
            doc.restore();
        };

        const drawTextRow = (label, values, opts = {}) => {
            const { bold, bg, textColor, labelColor, fontSize, emDash, height } = {
                bold: false, bg: null, textColor: '#333', labelColor: '#333', fontSize: 6.5, emDash: false, height: RH, ...opts
            };
            if (bg) doc.save().rect(mL, gridY, pageW, height).fill(bg).restore();
            gridLines(gridY, height);

            const ty = gridY + (height - fontSize) / 2;
            doc.fontSize(fontSize).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(labelColor);
            doc.text(label, mL + 6, ty, { width: labelW - 12, lineBreak: false });

            doc.fillColor(textColor).font(bold ? 'Helvetica-Bold' : 'Helvetica');
            for (let i = 0; i < 7; i++) {
                let v = values[i] || '';
                if (emDash && !v) v = '—';
                doc.text(String(v), mL + labelW + i * dayW, ty, { width: dayW, align: 'center', lineBreak: false });
            }
            gridY += height;
        };

        const drawCheckRow = (label, checked, color) => {
            gridLines(gridY, RH);
            const ty = gridY + (RH - 6.5) / 2;
            doc.fontSize(6.5).font('Helvetica').fillColor('#333');
            doc.text(label, mL + 28, ty, { width: labelW - 34, lineBreak: false });

            const bs = 8;
            const by = gridY + (RH - bs) / 2;
            for (let i = 0; i < 7; i++) {
                const cx = mL + labelW + i * dayW + (dayW - bs) / 2;
                if (checked[i]) {
                    doc.save().roundedRect(cx, by, bs, bs, 1.5).fill(color).restore();
                    doc.save().strokeColor('#fff').lineWidth(1.2);
                    doc.moveTo(cx + 2, by + 4.2).lineTo(cx + 3.5, by + 6).lineTo(cx + 6.2, by + 2.2).stroke();
                    doc.restore();
                } else {
                    doc.save().roundedRect(cx, by, bs, bs, 1.5).lineWidth(0.6).stroke('#bbb').restore();
                }
            }
            gridY += RH;
        };

        // ═══ PROGRAM SECTION ═══
        const drawSection = (name, subtitle, activities, section, color) => {
            const startY = gridY;

            // Section header
            const hh = 14;
            gridLines(gridY, hh);

            doc.fontSize(9).font('Helvetica-Bold').fillColor(color);
            doc.text(name, mL + 8, gridY + 2.5, { continued: true });
            doc.fontSize(6).font('Helvetica').fillColor('#777');
            doc.text(`  (${subtitle})`);
            gridY += hh;

            // Activity rows
            for (const act of activities) {
                const checked = ts.entries.map(e => {
                    const a = JSON.parse(e[`${section}Activities`] || '{}');
                    return !!a[act];
                });
                drawCheckRow(act, checked, color);
            }

            // Initials
            drawTextRow('PCA Initials', ts.entries.map(e => e[`${section}PcaInitials`] || ''), { bold: true, emDash: true });
            drawTextRow('Client Initials', ts.entries.map(e => e[`${section}ClientInitials`] || ''), { bold: true, emDash: true });

            // Shift rows
            let maxShifts = 1;
            for (const e of ts.entries) {
                const bl = parseBlocks(e[`${section}TimeBlocks`]);
                if (bl.length + 1 > maxShifts) maxShifts = bl.length + 1;
            }
            for (let s = 0; s < maxShifts; s++) {
                const vals = ts.entries.map(e => {
                    let ti, to;
                    if (s === 0) { ti = hhmm12(e[`${section}TimeIn`]); to = hhmm12(e[`${section}TimeOut`]); }
                    else { const bl = parseBlocks(e[`${section}TimeBlocks`]); ti = hhmm12(bl[s-1]?.in); to = hhmm12(bl[s-1]?.out); }
                    if (!ti && !to) return '';
                    return `${ti} - ${to}`;
                });
                drawTextRow(`Shift ${s+1} (Time In / Out)`, vals, { fontSize: 5.5, emDash: true });
            }

            // + Add Shift
            drawTextRow('+ Add Shift', ts.entries.map(() => ''), { fontSize: 5.5, labelColor: blue, emDash: true });

            const endY = gridY;

            // TOTALS in right column
            const totalH = ts.entries.reduce((s, e) => s + (e[`${section}Hours`] || 0), 0);
            const totalU = Math.round(totalH * 4);
            const tx = mL + labelW + 7 * dayW;
            const midY = startY + (endY - startY) / 2;

            doc.fontSize(5.5).font('Helvetica-Bold').fillColor(color).text('Hours', tx + totalsW - 20, midY - 16, { width: 18, align: 'right' });
            doc.fontSize(16).font('Helvetica-Bold').fillColor(color).text(totalH.toFixed(2), tx + 2, midY - 8, { width: totalsW - 4, align: 'center' });
            doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#555').text('Units', tx + totalsW - 20, midY + 10, { width: 18, align: 'right' });
            doc.fontSize(13).font('Helvetica-Bold').fillColor('#333').text(String(totalU), tx + 2, midY + 17, { width: totalsW - 4, align: 'center' });

            // Section bottom border
            doc.save().moveTo(mL, gridY).lineTo(mL + pageW, gridY).lineWidth(1.5).strokeColor('#fff').stroke().restore();
            gridY += 1;
        };

        // ═══ RENDER SECTIONS ═══
        drawSection('PAS', 'Personal Assistance Services', ADL_ACTIVITIES, 'adl', blue);
        drawSection('Homemaker', 'IADL Services', IADL_ACTIVITIES, 'iadl', green);

        const hasRespite = (ts.totalRespiteHours || 0) > 0 || ts.entries.some(e => {
            try { return Object.values(JSON.parse(e.respiteActivities || '{}')).some(Boolean); } catch { return false; }
        });
        if (hasRespite) {
            drawSection('Respite', 'Respite Services', RESPITE_ACTIVITIES, 'respite', orange);
        }

        // ═══ DAILY TOTALS BAR ═══
        const barH = 30;
        doc.save().rect(mL, gridY, pageW, barH).fill(navy).restore();

        // Label column dividers (subtle white)
        doc.save().lineWidth(0.3).strokeColor('rgba(255,255,255,0.25)');
        doc.moveTo(mL + labelW, gridY).lineTo(mL + labelW, gridY + barH).stroke();
        for (let i = 1; i < 7; i++) doc.moveTo(mL + labelW + i * dayW, gridY).lineTo(mL + labelW + i * dayW, gridY + barH).stroke();
        doc.moveTo(mL + labelW + 7 * dayW, gridY).lineTo(mL + labelW + 7 * dayW, gridY + barH).stroke();
        doc.restore();

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#fff');
        doc.text('DAILY TOTAL', mL + 8, gridY + 7);
        doc.fontSize(5.5).font('Helvetica').text('(All Programs)', mL + 8, gridY + 18);

        for (let i = 0; i < 7; i++) {
            const e = ts.entries[i];
            const dh = (e?.adlHours || 0) + (e?.iadlHours || 0) + (e?.respiteHours || 0);
            const du = Math.round(dh * 4);
            const x = mL + labelW + i * dayW;
            if (dh > 0) {
                doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff').text(dh.toFixed(2), x, gridY + 5, { width: dayW, align: 'center' });
                doc.fontSize(5.5).font('Helvetica').text(`${du} Units`, x, gridY + 18, { width: dayW, align: 'center' });
            } else {
                doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.4)').text('—', x, gridY + 10, { width: dayW, align: 'center' });
            }
        }

        // Week total badge
        const wtx = mL + labelW + 7 * dayW;
        doc.save().rect(wtx, gridY, totalsW, barH).fill(green).restore();
        doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#fff').text('WEEK TOTAL', wtx + 2, gridY + 4, { width: totalsW - 4, align: 'center' });
        doc.fontSize(9).text(`${(ts.totalHours || 0).toFixed(2)} Hours`, wtx + 2, gridY + 12, { width: totalsW - 4, align: 'center' });
        doc.fontSize(6.5).text(`${Math.round((ts.totalHours || 0) * 4)} Units`, wtx + 2, gridY + 22, { width: totalsW - 4, align: 'center' });

        gridY += barH + 8;

        // ═══ SIGNATURE SECTION ═══
        if (gridY + 60 > pageBottom) { doc.addPage(); gridY = 14; }

        const sigH = 58;
        doc.save().rect(mL, gridY, pageW, sigH).lineWidth(0.7).stroke('#ccc').restore();

        const sigColW = pageW / 4;
        for (let i = 1; i < 4; i++) {
            doc.save().moveTo(mL + sigColW * i, gridY).lineTo(mL + sigColW * i, gridY + sigH).lineWidth(0.5).stroke('#ddd').restore();
        }

        const pad = 8;
        const sw = sigColW - pad * 2;
        const cols = [mL + pad, mL + sigColW + pad, mL + sigColW * 2 + pad, mL + sigColW * 3 + pad];

        // Labels
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#333');
        doc.text('Caregiver / PCA (Employee)', cols[0], gridY + 4);
        doc.text('Client / Recipient', cols[1], gridY + 4);
        doc.text('Supervisor', cols[2], gridY + 4);
        doc.text('OFFICE USE ONLY', cols[3], gridY + 4);

        // Signatures
        const sigImgY = gridY + 14;
        const sigImgH = 22;
        if (ts.pcaSignature) { try { doc.image(ts.pcaSignature, cols[0], sigImgY, { width: sw * 0.75, height: sigImgH }); } catch {} }
        if (ts.recipientSignature) { try { doc.image(ts.recipientSignature, cols[1], sigImgY, { width: sw * 0.75, height: sigImgH }); } catch {} }
        if (ts.supervisorSignature) { try { doc.image(ts.supervisorSignature, cols[2], sigImgY, { width: sw * 0.75, height: sigImgH }); } catch {} }

        // Signature lines
        const lineY = gridY + 38;
        doc.save().lineWidth(0.5).strokeColor('#555');
        doc.moveTo(cols[0], lineY).lineTo(cols[0] + sw, lineY).stroke();
        doc.moveTo(cols[1], lineY).lineTo(cols[1] + sw, lineY).stroke();
        doc.moveTo(cols[2], lineY).lineTo(cols[2] + sw, lineY).stroke();
        doc.restore();

        // Dates
        const dateY = gridY + 42;
        doc.fontSize(6).font('Helvetica').fillColor('#555');
        doc.text(`Date:  ${ts.completionDate || '___/___/______'}`, cols[0], dateY);
        doc.text(`Date:  ${ts.completionDate || '___/___/______'}`, cols[1], dateY);
        doc.text(`Date:  ${ts.completionDate || '___/___/______'}`, cols[2], dateY);

        // Office Use Only
        doc.fontSize(6).font('Helvetica').fillColor('#555');
        doc.text('Accepted By: ______________________________     Date: ______________', cols[3], gridY + 20);
        doc.text('Comments: _______________________________________________________________', cols[3], gridY + 38);

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
