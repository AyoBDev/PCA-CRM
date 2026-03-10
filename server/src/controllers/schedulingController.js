const prisma = require('../lib/prisma');
const {
    computeShiftHours,
    detectOverlaps,
    computeUnitSummary,
    getWeekRange,
    enrichShift,
} = require('../services/schedulingService');

const shiftInclude = {
    client: { select: { id: true, clientName: true, address: true, phone: true, gateCode: true } },
    employee: { select: { id: true, name: true, email: true, phone: true } },
};

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
        const { clientId, employeeId, serviceCode, shiftDate, startTime, endTime, notes } = req.body;
        if (!clientId || !employeeId || !serviceCode || !shiftDate || !startTime || !endTime) {
            return res.status(400).json({ error: 'clientId, employeeId, serviceCode, shiftDate, startTime, and endTime are required' });
        }
        const { hours, units } = computeShiftHours(startTime, endTime);
        const shift = await prisma.shift.create({
            data: {
                clientId: Number(clientId),
                employeeId: Number(employeeId),
                serviceCode,
                shiftDate: new Date(shiftDate + 'T00:00:00.000Z'),
                startTime,
                endTime,
                hours,
                units,
                notes: notes || '',
            },
            include: shiftInclude,
        });
        res.status(201).json(enrichShift(shift));
    } catch (err) { next(err); }
}

// PUT /api/shifts/:id
async function updateShift(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { clientId, employeeId, serviceCode, shiftDate, startTime, endTime, notes, status } = req.body;

        const data = {};
        if (clientId !== undefined) data.clientId = Number(clientId);
        if (employeeId !== undefined) data.employeeId = Number(employeeId);
        if (serviceCode !== undefined) data.serviceCode = serviceCode;
        if (shiftDate !== undefined) data.shiftDate = new Date(shiftDate + 'T00:00:00.000Z');
        if (startTime !== undefined) data.startTime = startTime;
        if (endTime !== undefined) data.endTime = endTime;
        if (notes !== undefined) data.notes = notes;
        if (status !== undefined) data.status = status;

        // Recompute hours/units if times changed
        if (startTime !== undefined || endTime !== undefined) {
            const existing = await prisma.shift.findUnique({ where: { id } });
            if (!existing) return res.status(404).json({ error: 'Shift not found' });
            const st = startTime !== undefined ? startTime : existing.startTime;
            const et = endTime !== undefined ? endTime : existing.endTime;
            const { hours, units } = computeShiftHours(st, et);
            data.hours = hours;
            data.units = units;
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

// DELETE /api/shifts/:id
async function deleteShift(req, res, next) {
    try {
        const id = Number(req.params.id);
        await prisma.shift.delete({ where: { id } });
        res.status(204).end();
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Shift not found' });
        next(err);
    }
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

        res.json({
            client: { id: client.id, clientName: client.clientName, address: client.address, phone: client.phone, gateCode: client.gateCode, notes: client.notes },
            shifts: enriched,
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

module.exports = { listShifts, createShift, updateShift, deleteShift, getClientSchedule, getEmployeeSchedule };
