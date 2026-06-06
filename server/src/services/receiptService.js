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
    const val = Math.round(Number(n));
    return '$' + Math.abs(val).toLocaleString('en-US');
}

function fmtDateShort(d) {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const PURPLE = [128, 0, 128];
const WHITE = [255, 255, 255];

async function generateReceiptPdf(receipt) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageW = 792;
        const marginL = 50;
        const marginR = 50;
        const tableW = pageW - marginL - marginR;

        function drawRow(y, cols, opts = {}) {
            const { filled, height = 26 } = opts;
            const bg = filled ? PURPLE : null;
            const textColor = filled ? WHITE : [0, 0, 0];

            // Draw outer rect
            if (bg) {
                doc.rect(marginL, y, tableW, height).fill(bg);
            } else {
                doc.rect(marginL, y, tableW, height).lineWidth(1).stroke(PURPLE);
            }

            // Draw vertical cell dividers
            let x = marginL;
            for (let i = 0; i < cols.length - 1; i++) {
                const cellW = cols[i].width || (tableW / cols.length);
                x += cellW;
                doc.moveTo(x, y).lineTo(x, y + height)
                    .lineWidth(0.5).stroke(filled ? WHITE : PURPLE);
            }

            // Draw text
            x = marginL;
            for (const col of cols) {
                const cellW = col.width || (tableW / cols.length);
                const fs = col.fontSize || 10;
                doc.fill(textColor)
                    .font(col.bold || filled ? 'Helvetica-Bold' : 'Helvetica')
                    .fontSize(fs)
                    .text(col.text || '', x + 4, y + (height - fs) / 2, {
                        width: cellW - 8,
                        align: col.align || 'center',
                        lineBreak: false,
                    });
                x += cellW;
            }
            doc.fill([0, 0, 0]);
            return y + height;
        }

        function drawRowWrap(y, cols, opts = {}) {
            const { filled, height = 60 } = opts;
            const bg = filled ? PURPLE : null;
            const textColor = filled ? WHITE : [0, 0, 0];

            if (bg) {
                doc.rect(marginL, y, tableW, height).fill(bg);
            } else {
                doc.rect(marginL, y, tableW, height).lineWidth(1).stroke(PURPLE);
            }

            // Vertical dividers
            let x = marginL;
            for (let i = 0; i < cols.length - 1; i++) {
                const cellW = cols[i].width || (tableW / cols.length);
                x += cellW;
                doc.moveTo(x, y).lineTo(x, y + height)
                    .lineWidth(0.5).stroke(filled ? WHITE : PURPLE);
            }

            // Text (with wrap)
            x = marginL;
            for (const col of cols) {
                const cellW = col.width || (tableW / cols.length);
                const fs = col.fontSize || 10;
                doc.fill(textColor)
                    .font(col.bold || filled ? 'Helvetica-Bold' : 'Helvetica')
                    .fontSize(fs)
                    .text(col.text || '', x + 4, y + 8, {
                        width: cellW - 8,
                        align: col.align || 'center',
                        height: height - 12,
                    });
                x += cellW;
            }
            doc.fill([0, 0, 0]);
            return y + height;
        }

        // Company header
        doc.font('Helvetica-Bold').fontSize(14).fill([0, 0, 0])
            .text('Nevada Best PCA', marginL, 45);
        doc.font('Helvetica').fontSize(10)
            .text('2575 Montessouri St Ste 201 Las Vegas, NV 89117', marginL, 66)
            .text('Tel: 702-207-2526  Fax: 702-447-2524  nevadabestpca@gmail.com', marginL, 80);

        let y = 115;

        // === EMPLOYEE INFO TABLE ===
        const empColWidths = [220, 120, 100, 170, 82];
        y = drawRow(y, [
            { text: 'Employee Info', width: empColWidths[0] },
            { text: 'EIN/SS#', width: empColWidths[1] },
            { text: '1099/W2', width: empColWidths[2] },
            { text: 'Pay Period', width: empColWidths[3] },
            { text: 'Pay Date', width: empColWidths[4] },
        ], { filled: true, height: 28 });

        const empName = receipt.employee.name.toUpperCase();
        const empAddress = receipt.employee.address || '';
        const empInfo = empAddress ? `${empName}\n${empAddress}` : empName;
        const einSsn = receipt.ssn || receipt.ein || '—';
        const classification = receipt.classification || '—';
        const periodStr = `${fmtDateShort(receipt.periodStart)} - ${fmtDateShort(receipt.periodEnd)}`;
        const payDateStr = fmtDateShort(receipt.payDate);

        y = drawRowWrap(y, [
            { text: empInfo, width: empColWidths[0] },
            { text: einSsn, width: empColWidths[1] },
            { text: classification, width: empColWidths[2] },
            { text: periodStr, width: empColWidths[3] },
            { text: payDateStr, width: empColWidths[4] },
        ], { height: 60 });

        y += 25;

        // === EARNINGS TABLE ===
        const earnColWidths = [78, 62, 58, 105, 105, 112, 108, 64];
        y = drawRowWrap(y, [
            { text: 'Earnings', width: earnColWidths[0] },
            { text: 'Pay Rate', width: earnColWidths[1] },
            { text: 'Total Hours', width: earnColWidths[2] },
            { text: 'Current Earnings', width: earnColWidths[3] },
            { text: 'Current Deductions', width: earnColWidths[4] },
            { text: 'Current Other Deductions', width: earnColWidths[5] },
            { text: 'Current Overpayments', width: earnColWidths[6] },
            { text: 'Net Pay', width: earnColWidths[7] },
        ], { filled: true, height: 36 });

        const garnishDed = Math.abs(Number(receipt.garnishment)) + Math.abs(Number(receipt.childSupport));
        const otherDed = Math.abs(Number(receipt.otherDeductions));
        const overpayments = Math.abs(Number(receipt.overpaymentDeduction));

        y = drawRowWrap(y, [
            { text: 'Regular\nEarning', width: earnColWidths[0] },
            { text: String(Number(receipt.hourlyRate)), width: earnColWidths[1] },
            { text: String(Number(receipt.totalHours)), width: earnColWidths[2] },
            { text: fmtMoney(receipt.grossEarnings), width: earnColWidths[3] },
            { text: fmtMoney(garnishDed), width: earnColWidths[4] },
            { text: fmtMoney(otherDed), width: earnColWidths[5] },
            { text: fmtMoney(overpayments), width: earnColWidths[6] },
            { text: fmtMoney(receipt.netPay), width: earnColWidths[7] },
        ], { height: 100 });

        y += 30;

        // === YTD TABLE ===
        const ytdW = tableW / 4;
        y = drawRow(y, [
            { text: 'YTD GROSS', width: ytdW },
            { text: 'YTD DEDUCTIONS', width: ytdW },
            { text: 'YTD OVERPAYMENTS', width: ytdW },
            { text: 'YTD NET PAY', width: ytdW },
        ], { filled: true, height: 28 });

        y = drawRow(y, [
            { text: fmtMoney(receipt.ytdGross), width: ytdW },
            { text: fmtMoney(Math.abs(Number(receipt.ytdDeductions))), width: ytdW },
            { text: fmtMoney(Math.abs(Number(receipt.ytdOverpayments))), width: ytdW },
            { text: fmtMoney(receipt.ytdNet), width: ytdW },
        ], { filled: true, height: 28 });

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
