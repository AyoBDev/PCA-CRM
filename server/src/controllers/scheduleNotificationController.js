const prisma = require('../lib/prisma');
const { getWeekRange } = require('../services/schedulingService');
const {
    isSmsConfigured, isEmailConfigured,
    sendSms, sendEmail,
    formatScheduleSms, formatScheduleEmailHtml,
} = require('../services/notificationService');

async function sendSchedules(req, res) {
    const { weekStart, employeeIds } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const { weekStart: ws, weekEnd: we } = getWeekRange(weekStart);
    const weekLabel = `${ws} to ${we}`;

    // Get all shifts for the week, grouped by employee
    const where = {
        shiftDate: { gte: new Date(ws + 'T00:00:00.000Z'), lte: new Date(we + 'T23:59:59.999Z') },
        status: { not: 'cancelled' },
    };
    if (employeeIds?.length) where.employeeId = { in: employeeIds };

    const shifts = await prisma.shift.findMany({
        where,
        include: {
            client: { select: { clientName: true, address: true, phone: true, gateCode: true, notes: true } },
            employee: true,
        },
        orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
    });

    // Group by employee
    const byEmployee = new Map();
    for (const shift of shifts) {
        if (!shift.employeeId) continue;
        if (!byEmployee.has(shift.employeeId)) {
            byEmployee.set(shift.employeeId, { employee: shift.employee, shifts: [] });
        }
        byEmployee.get(shift.employeeId).shifts.push(shift);
    }

    const results = [];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    for (const [empId, { employee, shifts: empShifts }] of byEmployee) {
        const hasSms = isSmsConfigured() && employee.phone;
        const hasEmail = isEmailConfigured() && employee.email;

        if (!hasSms && !hasEmail) {
            results.push({ employeeId: empId, name: employee.name, status: 'skipped', reason: 'no contact info' });
            continue;
        }

        // Auto-generate permanent schedule link if one doesn't exist
        let scheduleLink = await prisma.employeeScheduleLink.findUnique({ where: { employeeId: empId } });
        if (!scheduleLink) {
            scheduleLink = await prisma.employeeScheduleLink.create({ data: { employeeId: empId } });
        } else if (!scheduleLink.active) {
            scheduleLink = await prisma.employeeScheduleLink.update({ where: { id: scheduleLink.id }, data: { active: true } });
        }
        const scheduleUrl = `${baseUrl}/schedule/view/${scheduleLink.token}`;

        // Create notification records and send
        if (hasSms) {
            const notification = await prisma.scheduleNotification.create({
                data: {
                    employeeId: empId,
                    weekStart: new Date(ws),
                    method: 'sms',
                    destination: employee.phone,
                },
            });
            try {
                const body = formatScheduleSms(employee.name, empShifts, weekLabel, scheduleUrl);
                await sendSms(employee.phone, body);
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'sms', status: 'sent' });
            } catch (err) {
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'failed', failureReason: err.message },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'sms', status: 'failed', reason: err.message });
            }
        }

        if (hasEmail) {
            const notification = await prisma.scheduleNotification.create({
                data: {
                    employeeId: empId,
                    weekStart: new Date(ws),
                    method: 'email',
                    destination: employee.email,
                },
            });
            try {
                const html = formatScheduleEmailHtml(employee.name, empShifts, weekLabel, scheduleUrl);
                const text = `Schedule for ${weekLabel}. View: ${scheduleUrl}`;
                await sendEmail(employee.email, `Your Schedule - ${weekLabel}`, html, text);
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'email', status: 'sent' });
            } catch (err) {
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'failed', failureReason: err.message },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'email', status: 'failed', reason: err.message });
            }
        }
    }

    res.json({ sent: results.length, results });
}

async function getNotificationStatus(req, res) {
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const { weekStart: ws } = getWeekRange(weekStart);

    const notifications = await prisma.scheduleNotification.findMany({
        where: { weekStart: new Date(ws) },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
    });

    res.json(notifications);
}

async function getScheduleConfirm(req, res) {
    const notification = await prisma.scheduleNotification.findUnique({
        where: { confirmationToken: req.params.token },
        include: { employee: true },
    });
    if (!notification) return res.status(404).json({ error: 'Invalid or expired link' });

    const { weekStart: ws, weekEnd: we } = getWeekRange(
        notification.weekStart.toISOString().split('T')[0]
    );

    const shifts = await prisma.shift.findMany({
        where: {
            employeeId: notification.employeeId,
            shiftDate: { gte: new Date(ws + 'T00:00:00.000Z'), lte: new Date(we + 'T23:59:59.999Z') },
            status: { not: 'cancelled' },
        },
        include: {
            client: { select: { clientName: true, address: true, phone: true, gateCode: true, notes: true } },
        },
        orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
    });

    res.json({
        employee: notification.employee,
        weekStart: ws,
        weekEnd: we,
        shifts,
        confirmed: !!notification.confirmedAt,
        confirmedAt: notification.confirmedAt,
    });
}

async function confirmSchedule(req, res) {
    const notification = await prisma.scheduleNotification.findUnique({
        where: { confirmationToken: req.params.token },
    });
    if (!notification) return res.status(404).json({ error: 'Invalid or expired link' });

    if (!notification.confirmedAt) {
        await prisma.scheduleNotification.update({
            where: { id: notification.id },
            data: { confirmedAt: new Date(), status: 'confirmed' },
        });
    }

    res.json({ success: true });
}

module.exports = { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule };
