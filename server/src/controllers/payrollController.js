'use strict';

const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { processPayrollRows, parseTimeToMinutes, minutesToHHMM, applyTimeRules, calcUnits, normalizeName } = require('../services/payrollService');

// ── Column aliases accepted from the XLSX header row ──────
const HEADER_ALIASES = {
    clientName:   ['client', 'client name', 'clientname', 'client_name', 'patient', 'patient name'],
    employeeName: ['employee name', 'employee', 'employeename', 'employee_name', 'pca', 'caregiver', 'staff'],
    service:      ['services', 'service', 'service name', 'services name', 'servicename', 'service type', 'service_name'],
    visitDate:    ['visit date', 'date', 'visitdate', 'visit_date', 'service date', 'date of service'],
    callInRaw:    ['call in', 'callin', 'call_in', 'time in', 'timein', 'in time', 'start time', 'start'],
    callOutRaw:   ['call out', 'callout', 'call_out', 'time out', 'timeout', 'out time', 'end time', 'end'],
    callHoursRaw: ['call hours', 'callhours', 'call_hours', 'hours', 'duration', 'total hours'],
    visitStatus:  ['visit status', 'status', 'visitstatus', 'visit_status'],
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
        // First pass: collect EVERY non-blank row (at least one non-empty cell).
        // We no longer silently drop rows with missing client/employee/date —
        // those are saved to the DB flagged needsReview so admins can fix them.
        const allRows = [];
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];

            // Skip rows that are completely empty
            if (row.every((cell) => cell === '' || cell === null || cell === undefined)) continue;

            // Extract raw cell values — preserve the original value for numerics
            const clientNameRaw  = colMap.clientName  != null ? row[colMap.clientName]  : '';
            const employeeRaw    = colMap.employeeName != null ? row[colMap.employeeName]: '';
            const visitDateRaw   = colMap.visitDate    != null ? row[colMap.visitDate]   : null;
            const callInCell     = colMap.callInRaw    != null ? row[colMap.callInRaw]   : '';
            const callOutCell    = colMap.callOutRaw   != null ? row[colMap.callOutRaw]  : '';

            const clientName  = String(clientNameRaw  || '').trim();
            const employeeName = String(employeeRaw   || '').trim();
            const callInRaw   = String(callInCell  || '').trim();
            const callOutRaw  = String(callOutCell || '').trim();

            // Build the review reasons list
            const reasons = [];
            if (!clientName)                                      reasons.push('missingClient');
            if (!employeeName)                                    reasons.push('missingEmployee');
            else if (/^\d+$/.test(employeeName))                  reasons.push('numericEmployee');
            if (!visitDateRaw && visitDateRaw !== 0)              reasons.push('missingDate');
            if (!callInRaw  && (typeof callInCell  !== 'number')) reasons.push('missingCallIn');
            if (!callOutRaw && (typeof callOutCell !== 'number')) reasons.push('missingCallOut');

            allRows.push({
                clientName,
                employeeName,
                service:      colMap.service      != null ? String(row[colMap.service]      || '').trim() : '',
                visitDate:    visitDateRaw,
                callInRaw:    callInCell,   // keep original (may be numeric Excel time)
                callOutRaw:   callOutCell,
                callHoursRaw: colMap.callHoursRaw != null ? row[colMap.callHoursRaw] : 0,
                visitStatus:  colMap.visitStatus  != null ? String(row[colMap.visitStatus]  || '').trim() : '',
                unitsRaw:     colMap.unitsRaw     != null ? row[colMap.unitsRaw]     : 0,
                needsReview:  reasons.length > 0,
                reviewReason: reasons.join(', '),
            });
        }

        // Second pass: merge adjacent EVV split-rows.
        // A split pair is two consecutive rows where:
        //   row A: has callIn, missing callOut   (EVV glitch — clock-in recorded, clock-out lost)
        //   row B: missing callIn, has callOut   (the other half)
        //   AND both share the same client, employee, service, and date.
        // Only merge rows that are not flagged for other review reasons.
        // Merge them into one row using A's callIn and B's callOut.
        // Mark with visitStatus 'Verified (merged)' so admins can see it was reconstructed.
        const rawRows = [];
        let skip = false;
        for (let i = 0; i < allRows.length; i++) {
            if (skip) { skip = false; continue; }
            const a = allRows[i];
            const b = allRows[i + 1];

            const aCallIn  = String(a.callInRaw  || '').trim();
            const aCallOut = String(a.callOutRaw || '').trim();
            const bCallIn  = b ? String(b.callInRaw  || '').trim() : '';
            const bCallOut = b ? String(b.callOutRaw || '').trim() : '';

            const aMissingOut = aCallIn  && !aCallOut;
            const bMissingIn  = b && !bCallIn && bCallOut;
            // EVV glitch: row A often has an empty service/employee; row B has the real values.
            // Match on client + date at minimum; treat empty service/employee as a wildcard.
            const sameKey = b &&
                a.clientName === b.clientName &&
                (a.employeeName === b.employeeName || !a.employeeName || !b.employeeName) &&
                (a.service      === b.service      || !a.service      || !b.service) &&
                String(a.visitDate) === String(b.visitDate);

            if (aMissingOut && bMissingIn && sameKey) {
                // Merge: take A's callIn, B's callOut; prefer the non-empty service/employee.
                // Re-evaluate review reasons on the merged row.
                const mergedEmployee = a.employeeName || b.employeeName;
                const mergedReasons  = [];
                if (!a.clientName)                                 mergedReasons.push('missingClient');
                if (!mergedEmployee)                               mergedReasons.push('missingEmployee');
                else if (/^\d+$/.test(mergedEmployee))             mergedReasons.push('numericEmployee');
                if (!a.visitDate && a.visitDate !== 0)             mergedReasons.push('missingDate');
                // callIn and callOut are both present after merge — no time reasons

                rawRows.push({
                    ...a,
                    employeeName: mergedEmployee,
                    service:      a.service || b.service,
                    callOutRaw:   b.callOutRaw,
                    visitStatus:  'Verified (merged)',
                    unitsRaw:     Math.max(a.unitsRaw || 0, b.unitsRaw || 0),
                    needsReview:  mergedReasons.length > 0,
                    reviewReason: mergedReasons.join(', '),
                });
                skip = true; // consume row B
            } else {
                rawRows.push(a);
            }
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
        const visitData = processed.map((v) => {
            let visitDate = null;
            if (v.visitDate instanceof Date)      visitDate = v.visitDate;
            else if (v.visitDate != null && v.visitDate !== '') visitDate = new Date(v.visitDate);

            return {
                runId:             run.id,
                clientName:        v.clientName        || '',
                employeeName:      v.employeeName      || '',
                service:           v.service           || '',
                visitDate,
                callInRaw:         v.callInMinutes     || 0,
                callOutRaw:        v.callOutMinutes    || 0,
                callHoursRaw:      v.durationMinutes   || 0,
                visitStatus:       v.visitStatus       || '',
                unitsRaw:          v.unitsRaw          || 0,
                serviceCode:       v.serviceCode       || '',
                callInTime:        v.callInTime        || '',
                callOutTime:       v.callOutTime       || '',
                durationMinutes:   v.durationMinutes   || 0,
                finalPayableUnits: v.finalPayableUnits || 0,
                voidFlag:          v.voidFlag          || false,
                voidReason:        v.voidReason        || '',
                overlapId:         v.overlapId         || '',
                isIncomplete:      v.isIncomplete      || false,
                isUnauthorized:    v.isUnauthorized    || false,
                needsReview:       v.needsReview       || false,
                reviewReason:      v.reviewReason      || '',
            };
        });

        await prisma.payrollVisit.createMany({ data: visitData });

        const totalPayable = processed
            .filter((v) => !v.voidFlag && !v.needsReview)
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

        // Build authMap: normalizedClientName → { serviceCode → authorizedUnits }
        const clients = await prisma.client.findMany({ include: { authorizations: true } });
        const authMap = {};
        for (const client of clients) {
            const norm = normalizeName(client.clientName);
            if (!authMap[norm]) authMap[norm] = {};
            for (const auth of client.authorizations) {
                const code = auth.serviceCode || auth.service || '';
                if (!code) continue;
                authMap[norm][code] = (authMap[norm][code] || 0) + (auth.authorizedUnits || 0);
            }
        }

        return res.json({ ...run, authMap });
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

        // Group visits by client (empty clientName → sentinel key)
        const clientGroups = new Map();
        for (const v of run.visits) {
            const key = v.clientName || '(Unknown Client)';
            if (!clientGroups.has(key)) clientGroups.set(key, []);
            clientGroups.get(key).push(v);
        }

        // Build rows array
        const header = ['Client', 'Employee', 'Service', 'Date', 'In', 'Out', 'Status', 'Units (Raw)', 'Final Units', 'Void?', 'Void/Review Reason', 'Overlap', 'Notes'];
        const aoa    = [header];

        for (const [clientName, visits] of clientGroups) {
            // Client banner row
            aoa.push([clientName, '', '', '', '', '', '', '', '', '', '', '', '']);

            for (const v of visits) {
                const reason = v.needsReview ? `NEEDS REVIEW: ${v.reviewReason}` : (v.voidReason || '');
                aoa.push([
                    v.clientName || '',
                    v.employeeName || '',
                    v.service || '',
                    v.visitDate ? new Date(v.visitDate).toLocaleDateString('en-US') : '',
                    v.callInTime  || '',
                    v.callOutTime || '',
                    v.visitStatus || '',
                    v.unitsRaw,
                    v.needsReview ? '' : (v.voidFlag ? 0 : v.finalPayableUnits),
                    v.needsReview ? 'REVIEW' : (v.voidFlag ? 'VOID' : ''),
                    reason,
                    v.overlapId || '',
                    v.notes     || '',
                ]);
            }

            // Total row (exclude needsReview from totals)
            const total = visits.filter((v) => !v.voidFlag && !v.needsReview).reduce((s, v) => s + v.finalPayableUnits, 0);
            aoa.push(['', '', '', '', '', '', 'TOTAL', '', total, '', '', '', '']);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Column widths
        ws['!cols'] = [
            { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 12 },
            { wch: 8  }, { wch: 8  }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 6  }, { wch: 35 }, { wch: 8  },
            { wch: 40 },
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

/**
 * PATCH /api/payroll/visits/:id
 * Update finalPayableUnits and/or notes on a single visit.
 */
async function updatePayrollVisit(req, res, next) {
    try {
        const id      = parseInt(req.params.id);
        const current = await prisma.payrollVisit.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: 'Visit not found.' });

        const data = {};

        if (req.body.finalPayableUnits !== undefined) {
            const u = parseInt(req.body.finalPayableUnits);
            if (isNaN(u) || u < 0) return res.status(400).json({ error: 'finalPayableUnits must be a non-negative integer.' });
            data.finalPayableUnits = u;
        }

        if (req.body.notes !== undefined) {
            data.notes = String(req.body.notes);
        }

        if (req.body.clientName !== undefined) {
            data.clientName = String(req.body.clientName).trim();
        }

        if (req.body.employeeName !== undefined) {
            data.employeeName = String(req.body.employeeName).trim();
        }

        if (req.body.visitDate !== undefined) {
            const d = req.body.visitDate ? new Date(req.body.visitDate) : null;
            data.visitDate = d && !isNaN(d) ? d : null;
        }

        // When either time field changes, re-run the time rules + unit calc
        const timesChanged = req.body.callInTime !== undefined || req.body.callOutTime !== undefined;
        if (timesChanged) {
            const inTime  = req.body.callInTime  !== undefined ? String(req.body.callInTime).trim()  : current.callInTime;
            const outTime = req.body.callOutTime !== undefined ? String(req.body.callOutTime).trim() : current.callOutTime;

            const v = {
                callInMinutes:  parseTimeToMinutes(inTime),
                callOutMinutes: parseTimeToMinutes(outTime),
                voidFlag:       false,
                voidReason:     '',
                durationMinutes: 0,
            };
            applyTimeRules(v);

            let finalPayableUnits = current.finalPayableUnits;
            if (!v.voidFlag) {
                const { units, voidFlag, voidReason } = calcUnits(v.durationMinutes);
                if (voidFlag) {
                    v.voidFlag        = true;
                    v.voidReason      = voidReason;
                    finalPayableUnits = 0;
                } else {
                    finalPayableUnits = units;
                }
            } else {
                finalPayableUnits = 0;
            }

            data.callInTime        = minutesToHHMM(v.callInMinutes);
            data.callOutTime       = minutesToHHMM(v.callOutMinutes % 1440);
            data.callInRaw         = v.callInMinutes;
            data.callOutRaw        = v.callOutMinutes;
            data.durationMinutes   = v.durationMinutes;
            data.finalPayableUnits = finalPayableUnits;
            data.voidFlag          = v.voidFlag;
            data.voidReason        = v.voidReason;
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Nothing to update.' });
        }

        // After applying edits, re-evaluate needsReview
        const merged = { ...current, ...data };
        const reasons = [];
        if (!merged.clientName)                                   reasons.push('missingClient');
        if (!merged.employeeName)                                 reasons.push('missingEmployee');
        else if (/^\d+$/.test(merged.employeeName))               reasons.push('numericEmployee');
        if (!merged.visitDate)                                    reasons.push('missingDate');
        if (!merged.callInTime  || merged.callInTime  === '00:00') reasons.push('missingCallIn');
        if (!merged.callOutTime || merged.callOutTime === '00:00') reasons.push('missingCallOut');

        data.needsReview  = reasons.length > 0;
        data.reviewReason = reasons.join(', ');

        const visit = await prisma.payrollVisit.update({ where: { id }, data });

        // Re-compute totalPayable on the parent run
        const allVisits = await prisma.payrollVisit.findMany({ where: { runId: visit.runId } });
        const totalPayable = allVisits.filter((v) => !v.voidFlag && !v.needsReview).reduce((s, v) => s + v.finalPayableUnits, 0);
        await prisma.payrollRun.update({ where: { id: visit.runId }, data: { totalPayable } });

        return res.json(visit);
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
    updatePayrollVisit,
};
