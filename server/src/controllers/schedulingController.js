const prisma = require('../lib/prisma');
const {
    computeShiftHours,
    detectOverlaps,
    computeUnitSummary,
    getWeekRange,
    enrichShift,
    getEmployeeDisplayName,
} = require('../services/schedulingService');

const shiftInclude = {
    client: { select: { id: true, clientName: true, address: true, phone: true, gateCode: true } },
    employee: { select: { id: true, name: true, email: true, phone: true } },
};

/**
 * Check if a proposed shift overlaps with existing shifts for the same employee on the same date.
 * Returns array of conflicting shifts (empty = no conflicts).
 */
async function checkOverlaps({ employeeId, employeeName, shiftDate, startTime, endTime, excludeId }) {
    if (!employeeId && !employeeName) return [];

    const dateStart = new Date(shiftDate + 'T00:00:00.000Z');
    const dateEnd = new Date(shiftDate + 'T23:59:59.999Z');

    const where = {
        shiftDate: { gte: dateStart, lte: dateEnd },
        status: { not: 'cancelled' },
    };

    // Match by employeeId or by employeeName (case-insensitive)
    if (employeeId) {
        where.employeeId = Number(employeeId);
    } else {
        where.employeeName = employeeName;
    }

    if (excludeId) where.id = { not: Number(excludeId) };

    const existing = await prisma.shift.findMany({ where, include: shiftInclude });

    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let sNew = toMin(startTime), eNew = toMin(endTime);
    if (eNew <= sNew) eNew += 24 * 60;

    const conflicts = [];
    for (const s of existing) {
        let sEx = toMin(s.startTime), eEx = toMin(s.endTime);
        if (eEx <= sEx) eEx += 24 * 60;
        if (sNew < eEx && sEx < eNew) {
            conflicts.push(enrichShift(s));
        }
    }
    return conflicts;
}

// GET /api/shifts?weekStart=YYYY-MM-DD&clientId=&employeeId=
async function listShifts(req, res, next) {
    try {
        const { weekStart, clientId, employeeId } = req.query;
        const range = getWeekRange(weekStart || undefined);

        const where = {
            shiftDate: {
                gte: new Date(range.weekStart + 'T00:00:00.000Z'),
                lte: new Date(range.weekEnd + 'T23:59:59.999Z'),
            },
        };
        if (clientId) where.clientId = Number(clientId);
        if (employeeId) where.employeeId = Number(employeeId);

        const shifts = await prisma.shift.findMany({
            where,
            include: shiftInclude,
            orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
        });

        const enriched = shifts.map(enrichShift);
        const overlaps = detectOverlaps(shifts);

        // Unit summaries per client
        const clientIds = [...new Set(shifts.map(s => s.clientId))];
        const auths = await prisma.authorization.findMany({
            where: { clientId: { in: clientIds } },
        });
        const authsByClient = {};
        for (const a of auths) {
            if (!authsByClient[a.clientId]) authsByClient[a.clientId] = [];
            authsByClient[a.clientId].push(a);
        }
        const unitSummaries = {};
        for (const cid of clientIds) {
            const clientShifts = shifts.filter(s => s.clientId === cid);
            unitSummaries[cid] = computeUnitSummary(clientShifts, authsByClient[cid] || []);
        }

        res.json({
            shifts: enriched,
            overlaps,
            unitSummaries,
            weekStart: range.weekStart,
            weekEnd: range.weekEnd,
        });
    } catch (err) { next(err); }
}

// POST /api/shifts
async function createShift(req, res, next) {
    try {
        const { clientId, employeeId, employeeName, serviceCode, shiftDate, startTime, endTime, notes, repeatUntil, force } = req.body;
        if (!clientId || !serviceCode || !shiftDate || !startTime || !endTime) {
            return res.status(400).json({ error: 'clientId, serviceCode, shiftDate, startTime, and endTime are required' });
        }
        if (!employeeId && !employeeName) {
            return res.status(400).json({ error: 'Either employeeId or employeeName is required' });
        }
        const { hours, units } = computeShiftHours(startTime, endTime);
        const baseData = {
            clientId: Number(clientId),
            serviceCode,
            startTime,
            endTime,
            hours,
            units,
            notes: notes || '',
            employeeName: employeeName || '',
        };
        if (employeeId) baseData.employeeId = Number(employeeId);

        // Build list of dates (single or recurring weekly)
        // Uses noon UTC to avoid DST day-shift issues
        const dates = [shiftDate];
        if (repeatUntil) {
            const endMs = new Date(repeatUntil + 'T12:00:00.000Z').getTime();
            let cursorMs = new Date(shiftDate + 'T12:00:00.000Z').getTime();
            const weekMs = 7 * 24 * 60 * 60 * 1000;
            cursorMs += weekMs;
            while (cursorMs <= endMs) {
                dates.push(new Date(cursorMs).toISOString().slice(0, 10));
                cursorMs += weekMs;
            }
        }

        // Check for overlaps before creating (unless force=true)
        if (!force) {
            const allConflicts = [];
            for (const date of dates) {
                const conflicts = await checkOverlaps({
                    employeeId: employeeId ? Number(employeeId) : null,
                    employeeName: employeeName || '',
                    shiftDate: date,
                    startTime,
                    endTime,
                });
                for (const c of conflicts) {
                    allConflicts.push({
                        date,
                        conflictWith: {
                            id: c.id,
                            clientName: c.client?.clientName || '',
                            startTime: c.startTime,
                            endTime: c.endTime,
                        },
                    });
                }
            }
            if (allConflicts.length > 0) {
                const empName = employeeName || (await prisma.user.findUnique({ where: { id: Number(employeeId) } }))?.name || '';
                return res.status(409).json({
                    error: 'overlap',
                    message: `${empName} already has ${allConflicts.length} overlapping shift${allConflicts.length > 1 ? 's' : ''}`,
                    conflicts: allConflicts,
                });
            }
        }

        // Assign a recurring group ID if multiple dates
        const groupId = dates.length > 1 ? `rg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : '';

        const created = [];
        for (const date of dates) {
            const shift = await prisma.shift.create({
                data: { ...baseData, shiftDate: new Date(date + 'T00:00:00.000Z'), recurringGroupId: groupId },
                include: shiftInclude,
            });
            created.push(enrichShift(shift));
        }

        res.status(201).json(created.length === 1 ? created[0] : { shifts: created, count: created.length });
    } catch (err) { next(err); }
}

// PUT /api/shifts/:id
async function updateShift(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { clientId, employeeId, employeeName, serviceCode, shiftDate, startTime, endTime, notes, status, force } = req.body;

        const existing = await prisma.shift.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Shift not found' });

        const data = {};
        if (clientId !== undefined) data.clientId = Number(clientId);
        if (employeeName !== undefined) {
            data.employeeName = employeeName;
            if (!employeeId && employeeName) data.employeeId = null;
        }
        if (employeeId !== undefined) data.employeeId = employeeId ? Number(employeeId) : null;
        if (serviceCode !== undefined) data.serviceCode = serviceCode;
        if (shiftDate !== undefined) data.shiftDate = new Date(shiftDate + 'T00:00:00.000Z');
        if (startTime !== undefined) data.startTime = startTime;
        if (endTime !== undefined) data.endTime = endTime;
        if (notes !== undefined) data.notes = notes;
        if (status !== undefined) data.status = status;

        // Recompute hours/units if times changed
        const st = startTime !== undefined ? startTime : existing.startTime;
        const et = endTime !== undefined ? endTime : existing.endTime;
        if (startTime !== undefined || endTime !== undefined) {
            const { hours, units } = computeShiftHours(st, et);
            data.hours = hours;
            data.units = units;
        }

        // Check overlaps if employee/date/time changed (unless force=true)
        const finalStatus = status !== undefined ? status : existing.status;
        if (!force && finalStatus !== 'cancelled') {
            const finalEmpId = employeeId !== undefined ? (employeeId ? Number(employeeId) : null) : existing.employeeId;
            const finalEmpName = employeeName !== undefined ? employeeName : existing.employeeName;
            const finalDate = shiftDate !== undefined ? shiftDate : existing.shiftDate.toISOString().slice(0, 10);

            const conflicts = await checkOverlaps({
                employeeId: finalEmpId,
                employeeName: finalEmpName,
                shiftDate: finalDate,
                startTime: st,
                endTime: et,
                excludeId: id,
            });
            if (conflicts.length > 0) {
                const empName = finalEmpName || (finalEmpId ? (await prisma.user.findUnique({ where: { id: finalEmpId } }))?.name : '') || '';
                return res.status(409).json({
                    error: 'overlap',
                    message: `${empName} already has an overlapping shift`,
                    conflicts: conflicts.map(c => ({
                        date: finalDate,
                        conflictWith: { id: c.id, clientName: c.client?.clientName || '', startTime: c.startTime, endTime: c.endTime },
                    })),
                });
            }
        }

        const shift = await prisma.shift.update({
            where: { id },
            data,
            include: shiftInclude,
        });
        res.json(enrichShift(shift));
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Shift not found' });
        next(err);
    }
}

// DELETE /api/shifts/:id?group=true (optional: delete entire recurring group)
async function deleteShift(req, res, next) {
    try {
        const id = Number(req.params.id);
        const deleteGroup = req.query.group === 'true';

        if (deleteGroup) {
            const shift = await prisma.shift.findUnique({ where: { id } });
            if (!shift) return res.status(404).json({ error: 'Shift not found' });
            if (shift.recurringGroupId) {
                const result = await prisma.shift.deleteMany({ where: { recurringGroupId: shift.recurringGroupId } });
                return res.json({ deleted: result.count });
            }
        }

        await prisma.shift.delete({ where: { id } });
        res.json({ deleted: 1 });
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Shift not found' });
        next(err);
    }
}

// DELETE /api/shifts (bulk delete all shifts)
async function deleteAllShifts(req, res, next) {
    try {
        const result = await prisma.shift.deleteMany({});
        res.json({ deleted: result.count });
    } catch (err) { next(err); }
}

// GET /api/shifts/client/:clientId?weekStart=
async function getClientSchedule(req, res, next) {
    try {
        const clientId = Number(req.params.clientId);
        const range = getWeekRange(req.query.weekStart || undefined);

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: { authorizations: true },
        });
        if (!client) return res.status(404).json({ error: 'Client not found' });

        const shifts = await prisma.shift.findMany({
            where: {
                clientId,
                shiftDate: {
                    gte: new Date(range.weekStart + 'T00:00:00.000Z'),
                    lte: new Date(range.weekEnd + 'T23:59:59.999Z'),
                },
            },
            include: shiftInclude,
            orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
        });

        const enriched = shifts.map(enrichShift);
        const unitSummary = computeUnitSummary(shifts, client.authorizations);

        // Detect overlaps: fetch ALL shifts this week for the employees in this client's shifts
        const employeeIds = [...new Set(shifts.filter(s => s.employeeId).map(s => s.employeeId))];
        const employeeNames = [...new Set(shifts.filter(s => !s.employeeId && s.employeeName).map(s => s.employeeName.toLowerCase().trim()))];

        let allEmpShifts = shifts;
        if (employeeIds.length > 0 || employeeNames.length > 0) {
            const or = [];
            if (employeeIds.length > 0) or.push({ employeeId: { in: employeeIds } });
            if (employeeNames.length > 0) {
                for (const name of employeeNames) or.push({ employeeName: name });
            }
            allEmpShifts = await prisma.shift.findMany({
                where: {
                    OR: or,
                    shiftDate: {
                        gte: new Date(range.weekStart + 'T00:00:00.000Z'),
                        lte: new Date(range.weekEnd + 'T23:59:59.999Z'),
                    },
                },
                include: shiftInclude,
            });
        }
        const overlaps = detectOverlaps(allEmpShifts);

        res.json({
            client: { id: client.id, clientName: client.clientName, address: client.address, phone: client.phone, gateCode: client.gateCode, notes: client.notes },
            shifts: enriched,
            overlaps,
            unitSummary,
            weekStart: range.weekStart,
            weekEnd: range.weekEnd,
        });
    } catch (err) { next(err); }
}

// GET /api/shifts/employee/:employeeId?weekStart=
async function getEmployeeSchedule(req, res, next) {
    try {
        const employeeId = Number(req.params.employeeId);
        const range = getWeekRange(req.query.weekStart || undefined);

        const employee = await prisma.user.findUnique({ where: { id: employeeId } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });

        const shifts = await prisma.shift.findMany({
            where: {
                employeeId,
                shiftDate: {
                    gte: new Date(range.weekStart + 'T00:00:00.000Z'),
                    lte: new Date(range.weekEnd + 'T23:59:59.999Z'),
                },
            },
            include: shiftInclude,
            orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
        });

        const enriched = shifts.map(enrichShift);
        const overlaps = detectOverlaps(shifts);

        res.json({
            employee: { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone },
            shifts: enriched,
            overlaps,
            weekStart: range.weekStart,
            weekEnd: range.weekEnd,
        });
    } catch (err) { next(err); }
}

// GET /api/shifts/employee-by-name?name=...&weekStart=
async function getEmployeeScheduleByName(req, res, next) {
    try {
        const { name, weekStart } = req.query;
        if (!name) return res.status(400).json({ error: 'name query parameter is required' });
        const range = getWeekRange(weekStart || undefined);

        const shifts = await prisma.shift.findMany({
            where: {
                employeeName: name,
                employeeId: null,
                shiftDate: {
                    gte: new Date(range.weekStart + 'T00:00:00.000Z'),
                    lte: new Date(range.weekEnd + 'T23:59:59.999Z'),
                },
            },
            include: shiftInclude,
            orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
        });

        const enriched = shifts.map(enrichShift);
        const overlaps = detectOverlaps(shifts);

        res.json({
            employee: { id: null, name, email: null, phone: null },
            shifts: enriched,
            overlaps,
            weekStart: range.weekStart,
            weekEnd: range.weekEnd,
        });
    } catch (err) { next(err); }
}

module.exports = { listShifts, createShift, updateShift, deleteShift, deleteAllShifts, getClientSchedule, getEmployeeSchedule, getEmployeeScheduleByName };
