const prisma = require('../lib/prisma');
const {
    computeShiftHours,
    detectOverlaps,
    computeUnitSummary,
    getWeekRange,
    enrichShift,
    getEmployeeDisplayName,
} = require('../services/schedulingService');
const { isSmsConfigured, isEmailConfigured, sendSms, sendEmail } = require('../services/notificationService');

const VALID_ACCOUNT_NUMBERS = ['71040', '71119', '71120', '71635'];

const shiftInclude = {
    client: { select: { id: true, clientName: true, address: true, phone: true, gateCode: true } },
    employee: { select: { id: true, name: true, email: true, phone: true } },
};

/**
 * Check if a proposed shift overlaps with existing shifts for the same employee on the same date.
 * Returns array of conflicting shifts (empty = no conflicts).
 */
async function checkOverlaps({ employeeId, shiftDate, startTime, endTime, excludeId }) {
    if (!employeeId) return [];

    const dateStart = new Date(shiftDate + 'T00:00:00.000Z');
    const dateEnd = new Date(shiftDate + 'T23:59:59.999Z');

    const where = {
        employeeId: Number(employeeId),
        shiftDate: { gte: dateStart, lte: dateEnd },
        status: { not: 'cancelled' },
    };

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

/**
 * Auto-notify an employee when their schedule changes (swap/cancel).
 * Silently skips if no notification services are configured or employee has no contact info.
 */
async function autoNotify(employeeId, shiftDate, req) {
    if (!employeeId) return;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return;

    const { weekStart: ws } = getWeekRange(shiftDate instanceof Date ? shiftDate.toISOString().split('T')[0] : shiftDate);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    if (isSmsConfigured() && employee.phone) {
        const notification = await prisma.scheduleNotification.create({
            data: { employeeId, weekStart: new Date(ws), method: 'sms', destination: employee.phone },
        });
        const confirmUrl = `${baseUrl}/schedule/confirm/${notification.confirmationToken}`;
        try {
            await sendSms(employee.phone, `NV Best PCA - Your schedule has been updated. View: ${confirmUrl}`);
            await prisma.scheduleNotification.update({ where: { id: notification.id }, data: { status: 'sent', sentAt: new Date() } });
        } catch (err) {
            await prisma.scheduleNotification.update({ where: { id: notification.id }, data: { status: 'failed', failureReason: err.message } });
        }
    }

    if (isEmailConfigured() && employee.email) {
        const notification = await prisma.scheduleNotification.create({
            data: { employeeId, weekStart: new Date(ws), method: 'email', destination: employee.email },
        });
        const confirmUrl = `${baseUrl}/schedule/confirm/${notification.confirmationToken}`;
        try {
            await sendEmail(employee.email, 'Schedule Updated', `<p>Your schedule has been updated. <a href="${confirmUrl}">View & Confirm</a></p>`, `Schedule updated: ${confirmUrl}`);
            await prisma.scheduleNotification.update({ where: { id: notification.id }, data: { status: 'sent', sentAt: new Date() } });
        } catch (err) {
            await prisma.scheduleNotification.update({ where: { id: notification.id }, data: { status: 'failed', failureReason: err.message } });
        }
    }
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
        const { clientId, employeeId, serviceCode, shiftDate, startTime, endTime, notes, repeatUntil, force, accountNumber, sandataClientId, shifts: bulkShifts } = req.body;

        // Bulk mode: array of { serviceCode, shiftDate, startTime, endTime } entries
        if (Array.isArray(bulkShifts) && bulkShifts.length > 0) {
            if (!clientId || !employeeId) {
                return res.status(400).json({ error: 'clientId and employeeId are required' });
            }
            if (accountNumber && !VALID_ACCOUNT_NUMBERS.includes(accountNumber)) {
                return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNT_NUMBERS.join(', ')}` });
            }

            // Validate all service codes are authorized for this client
            const now = new Date();
            const clientAuths = await prisma.authorization.findMany({
                where: { clientId: Number(clientId), authorizationEndDate: { gte: now } },
                select: { serviceCode: true },
            });
            const authorizedCodes = new Set(clientAuths.map(a => a.serviceCode));
            const unauthorized = [...new Set(bulkShifts.map(s => s.serviceCode))].filter(c => !authorizedCodes.has(c));
            if (unauthorized.length > 0) {
                return res.status(400).json({ error: `Service${unauthorized.length > 1 ? 's' : ''} not authorized for this client: ${unauthorized.join(', ')}` });
            }

            // Check overlaps for all entries
            if (!force) {
                const allConflicts = [];
                for (const entry of bulkShifts) {
                    const conflicts = await checkOverlaps({
                        employeeId: Number(employeeId),
                        shiftDate: entry.shiftDate,
                        startTime: entry.startTime,
                        endTime: entry.endTime,
                    });
                    for (const c of conflicts) {
                        allConflicts.push({
                            date: entry.shiftDate,
                            conflictWith: { id: c.id, clientName: c.client?.clientName || '', startTime: c.startTime, endTime: c.endTime },
                        });
                    }
                }
                if (allConflicts.length > 0) {
                    const empName = (await prisma.employee.findUnique({ where: { id: Number(employeeId) } }))?.name || '';
                    return res.status(409).json({
                        error: 'overlap',
                        message: `${empName} already has ${allConflicts.length} overlapping shift${allConflicts.length > 1 ? 's' : ''}`,
                        conflicts: allConflicts,
                    });
                }
            }

            const groupId = bulkShifts.length > 1 ? `rg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : '';
            const created = [];
            for (const entry of bulkShifts) {
                const { hours, units } = computeShiftHours(entry.startTime, entry.endTime);
                const shift = await prisma.shift.create({
                    data: {
                        clientId: Number(clientId),
                        employeeId: Number(employeeId),
                        serviceCode: entry.serviceCode,
                        shiftDate: new Date(entry.shiftDate + 'T00:00:00.000Z'),
                        startTime: entry.startTime,
                        endTime: entry.endTime,
                        hours,
                        units,
                        notes: notes || '',
                        accountNumber: accountNumber || '',
                        sandataClientId: sandataClientId || '',
                        recurringGroupId: groupId,
                    },
                    include: shiftInclude,
                });
                created.push(enrichShift(shift));
            }
            return res.status(201).json({ shifts: created, count: created.length });
        }

        // Single-shift mode (original flow)
        if (!clientId || !employeeId || !serviceCode || !shiftDate || !startTime || !endTime) {
            return res.status(400).json({ error: 'clientId, employeeId, serviceCode, shiftDate, startTime, and endTime are required' });
        }
        if (accountNumber && !VALID_ACCOUNT_NUMBERS.includes(accountNumber)) {
            return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNT_NUMBERS.join(', ')}` });
        }

        // Validate service is authorized for this client
        const singleAuth = await prisma.authorization.findFirst({
            where: { clientId: Number(clientId), serviceCode, authorizationEndDate: { gte: new Date() } },
        });
        if (!singleAuth) {
            return res.status(400).json({ error: `Service ${serviceCode} is not authorized for this client` });
        }

        const { hours, units } = computeShiftHours(startTime, endTime);
        const baseData = {
            clientId: Number(clientId),
            employeeId: Number(employeeId),
            serviceCode,
            startTime,
            endTime,
            hours,
            units,
            notes: notes || '',
            accountNumber: accountNumber || '',
            sandataClientId: sandataClientId || '',
        };

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
                    employeeId: Number(employeeId),
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
                const empName = (await prisma.employee.findUnique({ where: { id: Number(employeeId) } }))?.name || '';
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
        const { clientId, employeeId, serviceCode, shiftDate, startTime, endTime, notes, status, force, accountNumber, sandataClientId } = req.body;

        const existing = await prisma.shift.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Shift not found' });

        const data = {};
        if (clientId !== undefined) data.clientId = Number(clientId);
        if (employeeId !== undefined) data.employeeId = Number(employeeId);
        if (serviceCode !== undefined) data.serviceCode = serviceCode;
        if (shiftDate !== undefined) data.shiftDate = new Date(shiftDate + 'T00:00:00.000Z');
        if (startTime !== undefined) data.startTime = startTime;
        if (endTime !== undefined) data.endTime = endTime;
        if (notes !== undefined) data.notes = notes;
        if (status !== undefined) data.status = status;
        if (accountNumber !== undefined) {
            if (accountNumber && !VALID_ACCOUNT_NUMBERS.includes(accountNumber)) {
                return res.status(400).json({ error: `Invalid account number. Must be one of: ${VALID_ACCOUNT_NUMBERS.join(', ')}` });
            }
            data.accountNumber = accountNumber;
        }
        if (sandataClientId !== undefined) data.sandataClientId = sandataClientId;

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
            const finalEmpId = employeeId !== undefined ? Number(employeeId) : existing.employeeId;
            const finalDate = shiftDate !== undefined ? shiftDate : existing.shiftDate.toISOString().slice(0, 10);

            const conflicts = await checkOverlaps({
                employeeId: finalEmpId,
                shiftDate: finalDate,
                startTime: st,
                endTime: et,
                excludeId: id,
            });
            if (conflicts.length > 0) {
                const empName = (finalEmpId ? (await prisma.employee.findUnique({ where: { id: finalEmpId } }))?.name : '') || '';
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

        // Auto-notify if employee changed (caregiver swap)
        if (existing.employeeId !== shift.employeeId) {
            await autoNotify(existing.employeeId, shift.shiftDate, req);
            await autoNotify(shift.employeeId, shift.shiftDate, req);
        }

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

        // Capture shift info before deletion for auto-notify
        const shiftToDelete = await prisma.shift.findUnique({ where: { id } });
        if (!shiftToDelete) return res.status(404).json({ error: 'Shift not found' });

        if (deleteGroup && shiftToDelete.recurringGroupId) {
            const result = await prisma.shift.deleteMany({ where: { recurringGroupId: shiftToDelete.recurringGroupId } });
            await autoNotify(shiftToDelete.employeeId, shiftToDelete.shiftDate, req);
            return res.json({ deleted: result.count });
        }

        await prisma.shift.delete({ where: { id } });
        await autoNotify(shiftToDelete.employeeId, shiftToDelete.shiftDate, req);
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
        const employeeIds = [...new Set(shifts.map(s => s.employeeId))];

        let allEmpShifts = shifts;
        if (employeeIds.length > 0) {
            allEmpShifts = await prisma.shift.findMany({
                where: {
                    employeeId: { in: employeeIds },
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

        const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
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

// GET /api/shifts/auth-check?clientId=&serviceCode=&weekStart=
async function authCheck(req, res, next) {
    try {
        const { clientId, serviceCode, weekStart } = req.query;
        if (!clientId || !serviceCode || !weekStart) {
            return res.status(400).json({ error: 'clientId, serviceCode, and weekStart required' });
        }

        const { weekStart: ws, weekEnd: we } = getWeekRange(weekStart);

        const [auth, scheduledShifts] = await Promise.all([
            prisma.authorization.findFirst({
                where: {
                    clientId: Number(clientId),
                    serviceCode,
                    authorizationStartDate: { lte: new Date(we) },
                    authorizationEndDate: { gte: new Date(ws) },
                },
            }),
            prisma.shift.findMany({
                where: {
                    clientId: Number(clientId),
                    serviceCode,
                    shiftDate: { gte: new Date(ws), lte: new Date(we) },
                    status: { not: 'cancelled' },
                },
                select: { units: true },
            }),
        ]);

        const authorized = auth?.authorizedUnits || 0;
        const scheduled = scheduledShifts.reduce((sum, s) => sum + s.units, 0);

        res.json({
            authorized,
            scheduled,
            remaining: authorized - scheduled,
            serviceCode,
            weekStart: ws,
        });
    } catch (err) { next(err); }
}

module.exports = { listShifts, createShift, updateShift, deleteShift, deleteAllShifts, getClientSchedule, getEmployeeSchedule, authCheck };
