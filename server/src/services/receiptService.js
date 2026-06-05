const prisma = require('../lib/prisma');

const GARNISHMENT_RATE = 0.18;

function snapBiweeklyPeriod(date) {
    // Parse date string or Date object to UTC
    let d;
    if (typeof date === 'string') {
        // Ensure UTC parsing by appending 'T00:00:00.000Z' if not present
        const dateStr = date.includes('T') ? date : date + 'T00:00:00.000Z';
        d = new Date(dateStr);
    } else {
        d = new Date(date);
    }
    d.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = d.getUTCDay();
    const periodStart = new Date(d);
    periodStart.setUTCDate(d.getUTCDate() - dayOfWeek);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodStart.getUTCDate() + 13);
    return { periodStart, periodEnd };
}

function computeReceipt({ totalHours, hourlyRate, garnishmentActive, childSupportActive, childSupportAmount, overpaymentDeduction, otherDeductions }) {
    const grossEarnings = totalHours * hourlyRate;
    const garnishment = garnishmentActive ? -(grossEarnings * GARNISHMENT_RATE) : 0;
    const childSupport = childSupportActive ? -Math.abs(childSupportAmount || 0) : 0;
    const otherDed = -Math.abs(otherDeductions || 0);

    const availableForOverpayment = grossEarnings + garnishment + childSupport + otherDed;
    const requestedOverpayment = Math.abs(overpaymentDeduction || 0);
    const cappedOverpayment = Math.min(requestedOverpayment, Math.max(0, availableForOverpayment));
    const overpaymentDed = cappedOverpayment > 0 ? -cappedOverpayment : 0;

    const netPay = grossEarnings + garnishment + childSupport + otherDed + overpaymentDed;

    return {
        grossEarnings: Math.round(grossEarnings * 100) / 100,
        garnishment: Math.round(garnishment * 100) / 100,
        childSupport: Math.round(childSupport * 100) / 100,
        otherDeductions: Math.round(otherDed * 100) / 100,
        overpaymentDeduction: Math.round(overpaymentDed * 100) / 100,
        netPay: Math.round(netPay * 100) / 100,
    };
}

function computeYTD(priorReceipts, current, overrides) {
    let ytdGross = (overrides.ytdGrossOverride || 0);
    let ytdDeductions = (overrides.ytdDeductionsOverride || 0);
    let ytdOverpayments = (overrides.ytdOverpaymentOverride || 0);
    let ytdNet = (overrides.ytdNetOverride || 0);

    for (const r of priorReceipts) {
        ytdGross += Number(r.grossEarnings);
        ytdDeductions += Number(r.garnishment) + Number(r.childSupport) + Number(r.otherDeductions);
        ytdOverpayments += Number(r.overpaymentDeduction);
        ytdNet += Number(r.netPay);
    }

    ytdGross += current.grossEarnings;
    ytdDeductions += current.garnishment + current.childSupport + current.otherDeductions;
    ytdOverpayments += current.overpaymentDeduction;
    ytdNet += current.netPay;

    return {
        ytdGross: Math.round(ytdGross * 100) / 100,
        ytdDeductions: Math.round(ytdDeductions * 100) / 100,
        ytdOverpayments: Math.round(ytdOverpayments * 100) / 100,
        ytdNet: Math.round(ytdNet * 100) / 100,
    };
}

async function getEmployeeHours(employeeId, employeeName, periodStart, periodEnd) {
    const evvVisits = await prisma.payrollVisit.findMany({
        where: {
            employeeName: { contains: employeeName, mode: 'insensitive' },
            visitDate: { gte: periodStart, lte: periodEnd },
            needsReview: false,
            voidFlag: false,
        },
    });
    const evvHours = evvVisits.reduce((sum, v) => sum + (v.finalPayableUnits / 4), 0);

    const timesheets = await prisma.timesheet.findMany({
        where: {
            pcaId: employeeId,
            status: 'accepted',
            weekStart: { gte: periodStart, lte: periodEnd },
        },
        include: { entries: true },
    });
    const tsHours = timesheets.reduce((sum, ts) => {
        return sum + ts.entries.reduce((eSum, e) => eSum + (Number(e.totalHours) || 0), 0);
    }, 0);

    return Math.round((evvHours + tsHours) * 100) / 100;
}

async function getPriorReceipts(employeeId, periodStart) {
    const yearStart = new Date(periodStart.getUTCFullYear(), 0, 1);
    return prisma.payReceipt.findMany({
        where: {
            employeeId,
            periodStart: { gte: yearStart, lt: periodStart },
            status: { in: ['finalized', 'sent'] },
        },
        orderBy: { periodStart: 'asc' },
    });
}

module.exports = {
    snapBiweeklyPeriod,
    computeReceipt,
    computeYTD,
    getEmployeeHours,
    getPriorReceipts,
    GARNISHMENT_RATE,
};
