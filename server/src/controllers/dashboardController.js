const { enrichClient } = require('../services/authorizationService');
const { getWeekRange } = require('../services/schedulingService');
const { isOverdue } = require('../lib/timesheetUtils');

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
        req.db.client.count({ where: { archivedAt: null } }),
        req.db.employee.count({ where: { active: true, archivedAt: null } }),
        req.db.shift.count({
            where: {
                archivedAt: null,
                shiftDate: { gte: new Date(today + 'T00:00:00.000Z'), lte: new Date(today + 'T23:59:59.999Z') },
                status: { not: 'cancelled' },
            },
        }),
        req.db.shift.findMany({
            where: {
                archivedAt: null,
                shiftDate: { gte: new Date(weekStart + 'T00:00:00.000Z'), lte: new Date(weekEnd + 'T23:59:59.999Z') },
                status: { not: 'cancelled' },
            },
            select: { hours: true, units: true },
        }),
        req.db.scheduleNotification.count({
            where: { status: { in: ['pending', 'sent'] }, confirmedAt: null },
        }),
        req.db.client.findMany({
            where: { archivedAt: null },
            include: { authorizations: true },
        }),
        req.db.timesheet.count({ where: { status: 'draft', archivedAt: null } }),
        req.db.timesheet.count({ where: { status: 'submitted', archivedAt: null } }),
        req.db.payrollRun.findMany({
            where: { archivedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, name: true, status: true, totalVisits: true, totalPayable: true, createdAt: true },
        }),
    ]);

    const pendingOnboarding = await req.db.employee.count({
        where: { onboardingStatus: 'submitted' },
    });

    const overdueRaw = await req.db.timesheet.findMany({
        where: { status: 'draft', archivedAt: null },
        select: { id: true, pcaName: true, weekStart: true, status: true, client: { select: { clientName: true } } },
    });
    const overdueTimesheets = overdueRaw.filter(isOverdue).map(ts => ({
        timesheetId: ts.id,
        clientName: ts.client.clientName,
        pcaName: ts.pcaName,
        weekStart: ts.weekStart,
    }));

    const weekHours = weekShifts.reduce((sum, s) => sum + s.hours, 0);
    const weekUnits = weekShifts.reduce((sum, s) => sum + s.units, 0);

    // Compute auth stats at client level (matches Authorizations page KPI)
    const enrichedClients = clients.map(enrichClient);
    const expiringAuths = [];
    let expiredClientCount = 0;
    let renewalClientCount = 0;
    for (const client of enrichedClients) {
        if (client.overallStatus === 'Expired') expiredClientCount++;
        else if (client.overallStatus === 'Renewal Reminder') renewalClientCount++;

        for (const auth of (client.authorizations || [])) {
            if (auth.archivedAt) continue;
            if ((auth.manualStatus || 'active') !== 'active') continue;
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
        expiredClientCount,
        renewalClientCount,
        timesheetDraft,
        timesheetSubmitted,
        recentPayrollRuns: payrollRuns,
        overdueTimesheets: { count: overdueTimesheets.length, items: overdueTimesheets },
        pendingOnboarding,
    });
}

module.exports = { getDashboardStats };
