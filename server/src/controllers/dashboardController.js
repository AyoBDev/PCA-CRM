const prisma = require('../lib/prisma');
const { enrichClient } = require('../services/authorizationService');
const { getWeekRange } = require('../services/schedulingService');

async function getDashboardStats(req, res) {
    const today = new Date().toISOString().split('T')[0];
    const { weekStart, weekEnd } = getWeekRange(today);

    const [
        clientCount,
        employeeCount,
        todayShifts,
        weekShifts,
        unconfirmedNotifications,
        clients,
        timesheetDraft,
        timesheetSubmitted,
        payrollRuns,
    ] = await Promise.all([
        prisma.client.count({ where: { archivedAt: null } }),
        prisma.employee.count({ where: { active: true, archivedAt: null } }),
        prisma.shift.count({
            where: {
                archivedAt: null,
                shiftDate: { gte: new Date(today + 'T00:00:00.000Z'), lte: new Date(today + 'T23:59:59.999Z') },
                status: { not: 'cancelled' },
            },
        }),
        prisma.shift.findMany({
            where: {
                archivedAt: null,
                shiftDate: { gte: new Date(weekStart + 'T00:00:00.000Z'), lte: new Date(weekEnd + 'T23:59:59.999Z') },
                status: { not: 'cancelled' },
            },
            select: { hours: true, units: true },
        }),
        prisma.scheduleNotification.count({
            where: { status: { in: ['pending', 'sent'] }, confirmedAt: null },
        }),
        prisma.client.findMany({
            where: { archivedAt: null },
            include: { authorizations: true },
        }),
        prisma.timesheet.count({ where: { status: 'draft', archivedAt: null } }),
        prisma.timesheet.count({ where: { status: 'submitted', archivedAt: null } }),
        prisma.payrollRun.findMany({
            where: { archivedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, name: true, status: true, totalVisits: true, totalPayable: true, createdAt: true },
        }),
    ]);

    const weekHours = weekShifts.reduce((sum, s) => sum + s.hours, 0);
    const weekUnits = weekShifts.reduce((sum, s) => sum + s.units, 0);

    // Find expiring authorizations
    const enrichedClients = clients.map(enrichClient);
    const expiringAuths = [];
    for (const client of enrichedClients) {
        for (const auth of (client.authorizations || [])) {
            if (auth.status === 'Renewal Reminder' || auth.status === 'Expired') {
                expiringAuths.push({
                    clientName: client.clientName,
                    serviceCode: auth.serviceCode,
                    status: auth.status,
                    daysToExpire: auth.daysToExpire,
                });
            }
        }
    }

    res.json({
        activeClients: clientCount,
        activeEmployees: employeeCount,
        todayShifts,
        weekHours: Math.round(weekHours * 100) / 100,
        weekUnits,
        unconfirmedCount: unconfirmedNotifications,
        expiringAuths,
        timesheetDraft,
        timesheetSubmitted,
        recentPayrollRuns: payrollRuns,
    });
}

module.exports = { getDashboardStats };
