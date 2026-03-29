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
    ] = await Promise.all([
        prisma.client.count(),
        prisma.employee.count({ where: { active: true } }),
        prisma.shift.count({
            where: {
                shiftDate: new Date(today),
                status: { not: 'cancelled' },
            },
        }),
        prisma.shift.findMany({
            where: {
                shiftDate: { gte: new Date(weekStart), lte: new Date(weekEnd) },
                status: { not: 'cancelled' },
            },
            select: { hours: true, units: true },
        }),
        prisma.scheduleNotification.count({
            where: { status: { in: ['pending', 'sent'] }, confirmedAt: null },
        }),
        prisma.client.findMany({
            include: { authorizations: true },
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
    });
}

module.exports = { getDashboardStats };
