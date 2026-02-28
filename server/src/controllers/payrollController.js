'use strict';

const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { processPayrollRows } = require('../services/payrollService');

// ── Column aliases accepted from the XLSX header row ──────
const HEADER_ALIASES = {
    clientName:   ['client', 'client name', 'clientname', 'client_name', 'patient', 'patient name'],
    employeeName: ['employee', 'employee name', 'employeename', 'employee_name', 'pca', 'caregiver', 'staff'],
    service:      ['service', 'service name', 'servicename', 'service type', 'service_name'],
    visitDate:    ['date', 'visit date', 'visitdate', 'visit_date', 'service date', 'date of service'],
    callInRaw:    ['call in', 'callin', 'call_in', 'time in', 'timein', 'in time', 'start time', 'start'],
    callOutRaw:   ['call out', 'callout', 'call_out', 'time out', 'timeout', 'out time', 'end time', 'end'],
    callHoursRaw: ['hours', 'call hours', 'callhours', 'call_hours', 'duration', 'total hours'],
    visitStatus:  ['status', 'visit status', 'visitstatus', 'visit_status'],
    unitsRaw:     ['units', 'authorized units', 'auth units', 'units raw'],
};

/**
 * Find the index of a header column given a list of accepted aliases.
 */
function findColumnIndex(headers, aliases) {
    const lower = headers.map((h) => String(h || '').toLowerCase().trim());
    for (const alias of aliases) {
        const idx = lower.indexOf(alias);
        if (idx !== -1) return idx;
    }
    return -1;
}

/**
 * POST /api/payroll/runs
 * Accepts multipart/form-data with fields: file (xlsx), name, periodStart?, periodEnd?
 */
async function uploadPayrollRun(req, res, next) {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const runName    = String(req.body.name || '').trim() || req.file.originalname;
    const periodStart = req.body.periodStart ? new Date(req.body.periodStart) : null;
    const periodEnd   = req.body.periodEnd   ? new Date(req.body.periodEnd)   : null;

    // Create the run record immediately so we have an ID even if processing fails
    let run;
    try {
        run = await prisma.payrollRun.create({
            data: {
                name:        runName,
                fileName:    req.file.originalname,
                periodStart,
                periodEnd,
                status:      'processing',
            },
        });
    } catch (err) {
        return next(err);
    }

    try {
        // ── Parse XLSX ──────────────────────────────────────
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: true, cellDates: false });

        // Find the right sheet
        const sheetName =
            workbook.SheetNames.find((n) => /^visits$/i.test(n)) ||
            workbook.SheetNames.find((n) => /^result$/i.test(n)) ||
            workbook.SheetNames[0];

        if (!sheetName) {
            throw new Error('XLSX file contains no sheets.');
        }

        const sheet = workbook.Sheets[sheetName];
        const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

        if (rows.length < 2) {
            throw new Error('Sheet has fewer than 2 rows (no data).');
        }

        // Find header row (first row that contains at least 3 recognised column names)
        let headerRowIdx = -1;
        let colMap = {};
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const headers = rows[i];
            const map = {};
            let found = 0;
            for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
                const idx = findColumnIndex(headers, aliases);
                if (idx !== -1) { map[field] = idx; found++; }
            }
            if (found >= 3) { headerRowIdx = i; colMap = map; break; }
        }

        if (headerRowIdx === -1) {
            throw new Error('Could not find a valid header row. Expected columns: Client Name, Employee Name, Service, Visit Date, Call In, Call Out, Status.');
        }

        // ── Map data rows to rawRow objects ─────────────────
        const rawRows = [];
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];

            const clientName  = colMap.clientName   != null ? String(row[colMap.clientName]  || '').trim() : '';
            const visitDateRaw = colMap.visitDate   != null ? row[colMap.visitDate] : null;

            // Skip rows without a client name or visit date
            if (!clientName || visitDateRaw === null || visitDateRaw === '') continue;

            rawRows.push({
                clientName,
                employeeName: colMap.employeeName != null ? row[colMap.employeeName] : '',
                service:      colMap.service      != null ? row[colMap.service]      : '',
                visitDate:    visitDateRaw,
                callInRaw:    colMap.callInRaw    != null ? row[colMap.callInRaw]    : 0,
                callOutRaw:   colMap.callOutRaw   != null ? row[colMap.callOutRaw]   : 0,
                callHoursRaw: colMap.callHoursRaw != null ? row[colMap.callHoursRaw] : 0,
                visitStatus:  colMap.visitStatus  != null ? row[colMap.visitStatus]  : '',
                unitsRaw:     colMap.unitsRaw     != null ? row[colMap.unitsRaw]     : 0,
            });
        }

        if (rawRows.length === 0) {
            throw new Error('No data rows found after the header row.');
        }

        // ── Fetch clients + authorizations for auth cap ──────
        const clientsWithAuths = await prisma.client.findMany({
            include: { authorizations: true },
        });

        // ── Run processing pipeline ──────────────────────────
        const processed = processPayrollRows(rawRows, clientsWithAuths);

        // ── Persist visits ───────────────────────────────────
        const visitData = processed.map((v) => ({
            runId:             run.id,
            clientName:        v.clientName,
            employeeName:      v.employeeName,
            service:           v.service,
            visitDate:         v.visitDate instanceof Date ? v.visitDate : new Date(v.visitDate),
            callInRaw:         v.callInRaw,
            callOutRaw:        v.callOutRaw,
            callHoursRaw:      v.callHoursRaw,
            visitStatus:       v.visitStatus,
            unitsRaw:          v.unitsRaw,
            serviceCode:       v.serviceCode,
            callInTime:        v.callInTime,
            callOutTime:       v.callOutTime,
            durationMinutes:   v.durationMinutes,
            finalPayableUnits: v.finalPayableUnits,
            voidFlag:          v.voidFlag,
            voidReason:        v.voidReason,
            overlapId:         v.overlapId,
            isIncomplete:      v.isIncomplete,
            isUnauthorized:    v.isUnauthorized,
        }));

        await prisma.payrollVisit.createMany({ data: visitData });

        const totalPayable = processed
            .filter((v) => !v.voidFlag)
            .reduce((s, v) => s + v.finalPayableUnits, 0);

        const updatedRun = await prisma.payrollRun.update({
            where: { id: run.id },
            data: {
                status:       'done',
                totalVisits:  processed.length,
                totalPayable,
            },
            include: {
                visits: { orderBy: [{ clientName: 'asc' }, { visitDate: 'asc' }] },
            },
        });

        return res.status(201).json(updatedRun);
    } catch (err) {
        // Update run status to error
        await prisma.payrollRun.update({
            where: { id: run.id },
            data: { status: 'error', errorMessage: err.message },
        }).catch(() => {});

        return next(err);
    }
}

/**
 * GET /api/payroll/runs
 */
async function listPayrollRuns(req, res, next) {
    try {
        const runs = await prisma.payrollRun.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id:           true,
                name:         true,
                fileName:     true,
                periodStart:  true,
                periodEnd:    true,
                status:       true,
                totalVisits:  true,
                totalPayable: true,
                errorMessage: true,
                createdAt:    true,
                updatedAt:    true,
            },
        });
        return res.json(runs);
    } catch (err) {
        return next(err);
    }
}

/**
 * GET /api/payroll/runs/:id
 */
async function getPayrollRun(req, res, next) {
    try {
        const id = parseInt(req.params.id);
        const run = await prisma.payrollRun.findUnique({
            where: { id },
            include: {
                visits: { orderBy: [{ clientName: 'asc' }, { visitDate: 'asc' }] },
            },
        });
        if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
        return res.json(run);
    } catch (err) {
        return next(err);
    }
}

/**
 * DELETE /api/payroll/runs/:id
 */
async function deletePayrollRun(req, res, next) {
    try {
        const id = parseInt(req.params.id);
        await prisma.payrollRun.delete({ where: { id } });
        return res.status(204).send();
    } catch (err) {
        return next(err);
    }
}

/**
 * GET /api/payroll/runs/:id/export
 * Returns an XLSX file download.
 */
async function exportPayrollRun(req, res, next) {
    try {
        const id = parseInt(req.params.id);
        const run = await prisma.payrollRun.findUnique({
            where: { id },
            include: {
                visits: { orderBy: [{ clientName: 'asc' }, { visitDate: 'asc' }] },
            },
        });
        if (!run) return res.status(404).json({ error: 'Payroll run not found.' });

        // Group visits by client
        const clientGroups = new Map();
        for (const v of run.visits) {
            if (!clientGroups.has(v.clientName)) clientGroups.set(v.clientName, []);
            clientGroups.get(v.clientName).push(v);
        }

        // Build rows array
        const header = ['Client', 'Employee', 'Service', 'Date', 'In', 'Out', 'Status', 'Units (Raw)', 'Final Units', 'Void?', 'Void Reason', 'Overlap'];
        const aoa    = [header];

        for (const [clientName, visits] of clientGroups) {
            // Client banner row
            aoa.push([clientName, '', '', '', '', '', '', '', '', '', '', '']);

            for (const v of visits) {
                aoa.push([
                    '',
                    v.employeeName,
                    v.service,
                    v.visitDate ? new Date(v.visitDate).toLocaleDateString('en-US') : '',
                    v.callInTime,
                    v.callOutTime,
                    v.visitStatus,
                    v.unitsRaw,
                    v.voidFlag ? 0 : v.finalPayableUnits,
                    v.voidFlag ? 'VOID' : '',
                    v.voidReason,
                    v.overlapId,
                ]);
            }

            // Total row
            const total = visits.filter((v) => !v.voidFlag).reduce((s, v) => s + v.finalPayableUnits, 0);
            aoa.push(['', '', '', '', '', '', 'TOTAL', '', total, '', '', '']);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Column widths
        ws['!cols'] = [
            { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 12 },
            { wch: 8  }, { wch: 8  }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 6  }, { wch: 35 }, { wch: 8  },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Payroll');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const safeName = run.name.replace(/[^a-z0-9_\-]/gi, '_');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="payroll_${safeName}.xlsx"`);
        return res.send(buf);
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    uploadPayrollRun,
    listPayrollRuns,
    getPayrollRun,
    deletePayrollRun,
    exportPayrollRun,
};
