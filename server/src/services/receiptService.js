const prisma = require('../lib/prisma');
const PDFDocument = require('pdfkit');

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
    const midpoint = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const evvVisits = await prisma.payrollVisit.findMany({
        where: {
            employeeName: { contains: employeeName, mode: 'insensitive' },
            visitDate: { gte: periodStart, lte: periodEnd },
            needsReview: false,
            voidFlag: false,
        },
    });
    let evvW1 = 0, evvW2 = 0;
    for (const v of evvVisits) {
        const hrs = v.finalPayableUnits / 4;
        if (v.visitDate < midpoint) evvW1 += hrs;
        else evvW2 += hrs;
    }

    const timesheets = await prisma.timesheet.findMany({
        where: {
            pcaName: { contains: employeeName, mode: 'insensitive' },
            status: { in: ['submitted', 'accepted'] },
            weekStart: { gte: periodStart, lte: periodEnd },
        },
    });
    let tsW1 = 0, tsW2 = 0;
    for (const ts of timesheets) {
        const hrs = Number(ts.totalHours) || 0;
        if (ts.weekStart < midpoint) tsW1 += hrs;
        else tsW2 += hrs;
    }

    const week1Hours = Math.round((evvW1 + tsW1) * 100) / 100;
    const week2Hours = Math.round((evvW2 + tsW2) * 100) / 100;
    return { week1Hours, week2Hours, totalHours: Math.round((week1Hours + week2Hours) * 100) / 100 };
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

function fmtMoney(n) {
    const abs = Math.abs(Number(n));
    const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n) < 0 ? `-${formatted}` : formatted;
}

function fmtDate(d) {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

async function generateReceiptPdf(receipt) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('Nevada Best PCA, LLC', { align: 'center' });
        doc.fontSize(14).font('Helvetica').text('PAY STATEMENT', { align: 'center' });
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Employee info
        doc.fontSize(10).font('Helvetica');
        doc.text(`Employee: ${receipt.employee.name}`);
        if (receipt.employee.address) doc.text(`Address: ${receipt.employee.address}`);
        if (receipt.ssn) doc.text(`SSN: ${receipt.ssn}`);
        if (receipt.ein) doc.text(`EIN: ${receipt.ein}`);
        if (receipt.accountNumber) doc.text(`Account #: ${receipt.accountNumber}`);
        doc.text(`Classification: ${receipt.classification}`);
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Pay period
        doc.text(`Pay Period: ${fmtDate(receipt.periodStart)} – ${fmtDate(receipt.periodEnd)}`);
        doc.text(`Pay Date: ${fmtDate(receipt.payDate)}`);
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Earnings
        doc.font('Helvetica-Bold').fontSize(11).text('EARNINGS');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica-Bold');
        const earningsY = doc.y;
        doc.text('Description', 50, earningsY, { width: 150 });
        doc.text('Hours', 200, earningsY, { width: 70, align: 'right' });
        doc.text('Rate', 270, earningsY, { width: 70, align: 'right' });
        doc.text('Current', 370, earningsY, { width: 90, align: 'right' });
        doc.text('YTD', 460, earningsY, { width: 90, align: 'right' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);
        const earningsRowY = doc.y;
        doc.text('Regular Earnings', 50, earningsRowY, { width: 150 });
        doc.text(Number(receipt.totalHours).toFixed(2), 200, earningsRowY, { width: 70, align: 'right' });
        doc.text(fmtMoney(receipt.hourlyRate), 270, earningsRowY, { width: 70, align: 'right' });
        doc.text(fmtMoney(receipt.grossEarnings), 370, earningsRowY, { width: 90, align: 'right' });
        doc.text(fmtMoney(receipt.ytdGross), 460, earningsRowY, { width: 90, align: 'right' });
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Deductions
        doc.font('Helvetica-Bold').fontSize(11).text('DEDUCTIONS');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica-Bold');
        const dedHeaderY = doc.y;
        doc.text('Description', 50, dedHeaderY, { width: 200 });
        doc.text('Current', 370, dedHeaderY, { width: 90, align: 'right' });
        doc.text('YTD', 460, dedHeaderY, { width: 90, align: 'right' });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);

        const deductions = [
            { label: 'Garnishment (18%)', current: receipt.garnishment, ytd: null },
            { label: 'Child Support', current: receipt.childSupport, ytd: null },
            { label: 'Overpayment', current: receipt.overpaymentDeduction, ytd: receipt.ytdOverpayments },
            { label: 'Other Deductions', current: receipt.otherDeductions, ytd: null },
        ];
        const ytdDedTotal = receipt.ytdDeductions;

        for (let i = 0; i < deductions.length; i++) {
            const row = deductions[i];
            const rowY = doc.y;
            doc.text(row.label, 50, rowY, { width: 200 });
            doc.text(fmtMoney(row.current), 370, rowY, { width: 90, align: 'right' });
            if (i === 0) {
                doc.text(fmtMoney(ytdDedTotal), 460, rowY, { width: 90, align: 'right' });
            } else if (row.ytd !== null) {
                doc.text(fmtMoney(row.ytd), 460, rowY, { width: 90, align: 'right' });
            } else {
                doc.text('—', 460, rowY, { width: 90, align: 'right' });
            }
            doc.moveDown(0.5);
        }
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);

        // Net Pay
        doc.font('Helvetica-Bold').fontSize(12);
        const netY = doc.y;
        doc.text('NET PAY', 50, netY, { width: 200 });
        doc.text(fmtMoney(receipt.netPay), 370, netY, { width: 90, align: 'right' });
        doc.text(fmtMoney(receipt.ytdNet), 460, netY, { width: 90, align: 'right' });
        doc.moveDown(2);

        // Footer
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9).text('Nevada Best PCA, LLC', { align: 'center' });

        doc.end();
    });
}

module.exports = {
    snapBiweeklyPeriod,
    computeReceipt,
    computeYTD,
    getEmployeeHours,
    getPriorReceipts,
    generateReceiptPdf,
    GARNISHMENT_RATE,
};
