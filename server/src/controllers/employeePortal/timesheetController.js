const prisma = require('../../lib/prisma');
const { computeHours, roundTo15, computeTotalHoursWithBlocks } = require('../../lib/timesheetUtils');

function getCurrentWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
}

async function getTimesheet(req, res, next) {
    try {
        const employeeId = req.employee.id;
        const employee = await prisma.employee.findUnique({ where: { id: employeeId } });

        const link = await prisma.permanentLink.findFirst({
            where: { pcaName: employee.name, active: true },
            include: { client: { include: { authorizations: true } } },
        });

        if (!link) return res.json({ noLink: true, message: 'No timesheet link found for your account.' });

        const weekStart = req.query.weekStart || getCurrentWeekStart();
        const weekStartDate = new Date(weekStart + 'T00:00:00.000Z');

        let timesheet = await prisma.timesheet.findFirst({
            where: { clientId: link.clientId, pcaName: link.pcaName, weekStart: weekStartDate, archivedAt: null },
            include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
        });

        if (!timesheet) {
            timesheet = { id: null, status: 'new', entries: [], weekStart: weekStartDate };
        }

        const weekEnd = new Date(weekStartDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const activeAuths = (link.client.authorizations || []).filter(a => {
            if (a.archivedAt) return false;
            if (a.manualStatus && a.manualStatus !== 'active') return false;
            const start = a.authorizationStartDate ? new Date(a.authorizationStartDate) : null;
            const end = a.authorizationEndDate ? new Date(a.authorizationEndDate) : null;
            if (start && start > weekEnd) return false;
            if (end && end < weekStartDate) return false;
            return true;
        });

        res.json({
            timesheet,
            client: { id: link.client.id, name: link.client.clientName },
            pcaName: link.pcaName,
            token: link.token,
            authorizations: activeAuths,
        });
    } catch (err) { next(err); }
}

module.exports = { getTimesheet };
