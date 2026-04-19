const prisma = require('../lib/prisma');
const { getWeekRange, SERVICE_COLOR_MAP } = require('../services/schedulingService');

// POST /api/employee-schedule-links
async function createLink(req, res, next) {
    try {
        const { employeeId } = req.body;
        if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

        // Upsert: reactivate if exists but inactive, or create new
        const existing = await prisma.employeeScheduleLink.findUnique({ where: { employeeId: Number(employeeId) } });
        let link;
        if (existing) {
            link = await prisma.employeeScheduleLink.update({
                where: { id: existing.id },
                data: { active: true },
                include: { employee: true },
            });
        } else {
            link = await prisma.employeeScheduleLink.create({
                data: { employeeId: Number(employeeId) },
                include: { employee: true },
            });
        }

        const origin = `${req.protocol}://${req.get('host')}`;
        res.status(201).json({ ...link, url: `${origin}/schedule/view/${link.token}` });
    } catch (err) {
        next(err);
    }
}

// GET /api/employee-schedule-links
async function listLinks(req, res, next) {
    try {
        const links = await prisma.employeeScheduleLink.findMany({
            include: { employee: true },
            orderBy: { createdAt: 'desc' },
        });
        const origin = `${req.protocol}://${req.get('host')}`;
        res.json(links.map(l => ({ ...l, url: `${origin}/schedule/view/${l.token}` })));
    } catch (err) {
        next(err);
    }
}

// DELETE /api/employee-schedule-links/:id
async function deleteLink(req, res, next) {
    try {
        await prisma.employeeScheduleLink.update({
            where: { id: Number(req.params.id) },
            data: { active: false },
        });
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Link not found' });
        next(err);
    }
}

// GET /api/schedule/view/:token (PUBLIC — no auth)
async function getScheduleView(req, res) {
    const link = await prisma.employeeScheduleLink.findUnique({
        where: { token: req.params.token },
        include: { employee: true },
    });
    if (!link) return res.status(404).json({ error: 'Invalid link' });
    if (!link.active) return res.status(403).json({ error: 'This schedule link has been deactivated' });

    // Determine which week to show — default to current week
    const dateParam = req.query.weekStart || new Date().toISOString().split('T')[0];
    const { weekStart, weekEnd } = getWeekRange(dateParam);

    const shifts = await prisma.shift.findMany({
        where: {
            employeeId: link.employeeId,
            shiftDate: { gte: new Date(weekStart + 'T00:00:00.000Z'), lte: new Date(weekEnd + 'T23:59:59.999Z') },
            status: { not: 'cancelled' },
            archivedAt: null,
        },
        include: {
            client: {
                select: {
                    clientName: true, address: true,
                    phone: true, gateCode: true, notes: true,
                },
            },
        },
        orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
    });

    const enrichedShifts = shifts.map(s => ({
        ...s,
        serviceLabel: (SERVICE_COLOR_MAP[s.serviceCode] || {}).label || s.serviceCode,
    }));

    res.json({
        employee: { id: link.employee.id, name: link.employee.name },
        weekStart,
        weekEnd,
        shifts: enrichedShifts,
    });
}

module.exports = { createLink, listLinks, deleteLink, getScheduleView };
