const prisma = require('../lib/prisma');
const { computeReceipt, computeYTD, getEmployeeHours, getPriorReceipts, generateReceiptPdf, snapBiweeklyPeriod } = require('../services/receiptService');
const { decrypt, maskSSN, maskEIN } = require('../services/encryptionService');
const { sendEmail } = require('../services/notificationService');
const audit = require('../services/auditService');

async function listReceipts(req, res) {
    const { status, periodStart, search } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;
    if (periodStart) where.periodStart = new Date(periodStart);
    if (search) {
        where.employee = { name: { contains: search, mode: 'insensitive' } };
    }
    const receipts = await prisma.payReceipt.findMany({
        where,
        include: { employee: { select: { id: true, name: true, email: true } } },
        orderBy: [{ periodStart: 'desc' }, { employee: { name: 'asc' } }],
    });
    res.json(receipts.map(r => ({
        ...r,
        totalHours: Number(r.totalHours),
        hourlyRate: Number(r.hourlyRate),
        grossEarnings: Number(r.grossEarnings),
        garnishment: Number(r.garnishment),
        childSupport: Number(r.childSupport),
        overpaymentDeduction: Number(r.overpaymentDeduction),
        otherDeductions: Number(r.otherDeductions),
        netPay: Number(r.netPay),
        ytdGross: Number(r.ytdGross),
        ytdDeductions: Number(r.ytdDeductions),
        ytdOverpayments: Number(r.ytdOverpayments),
        ytdNet: Number(r.ytdNet),
    })));
}

async function previewReceipts(req, res) {
    const { periodStart, periodEnd } = req.body;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const profiles = await prisma.payrollProfile.findMany({
        include: { employee: { select: { id: true, name: true, email: true, active: true } } },
    });
    const activeProfiles = profiles.filter(p => p.employee.active);

    const previews = [];
    for (const profile of activeProfiles) {
        const { week1Hours, week2Hours, totalHours } = await getEmployeeHours(profile.employeeId, profile.employee.name, start, end);
        const computed = computeReceipt({
            totalHours,
            hourlyRate: Number(profile.hourlyRate),
            garnishmentActive: profile.garnishmentActive,
            childSupportActive: profile.childSupportActive,
            childSupportAmount: Number(profile.childSupportAmount),
            overpaymentDeduction: Number(profile.overpaymentBalance) > 0 ? Number(profile.overpaymentBalance) : 0,
            otherDeductions: 0,
        });
        previews.push({
            employeeId: profile.employeeId,
            employeeName: profile.employee.name,
            employeeEmail: profile.employee.email,
            week1Hours,
            week2Hours,
            totalHours,
            hourlyRate: Number(profile.hourlyRate),
            ...computed,
            overpaymentBalance: Number(profile.overpaymentBalance),
            hasEmail: !!profile.employee.email,
        });
    }
    res.json(previews);
}

async function generateReceipts(req, res) {
    const { periodStart, periodEnd, payDate, receipts: receiptInputs, sendEmail: shouldSend } = req.body;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const payDt = new Date(payDate);

    const created = [];
    for (const input of receiptInputs) {
        const profile = await prisma.payrollProfile.findUnique({
            where: { employeeId: input.employeeId },
            include: { employee: { select: { id: true, name: true, email: true, address: true } } },
        });
        if (!profile) continue;

        const computed = computeReceipt({
            totalHours: input.totalHours,
            hourlyRate: input.hourlyRate,
            garnishmentActive: profile.garnishmentActive,
            childSupportActive: profile.childSupportActive,
            childSupportAmount: Number(profile.childSupportAmount),
            overpaymentDeduction: input.overpaymentDeduction || 0,
            otherDeductions: input.otherDeductions || 0,
        });

        const priorReceipts = await getPriorReceipts(input.employeeId, start);
        const overrides = {
            ytdGrossOverride: profile.ytdGrossOverride ? Number(profile.ytdGrossOverride) : 0,
            ytdDeductionsOverride: profile.ytdDeductionsOverride ? Number(profile.ytdDeductionsOverride) : 0,
            ytdNetOverride: profile.ytdNetOverride ? Number(profile.ytdNetOverride) : 0,
            ytdOverpaymentOverride: profile.ytdOverpaymentOverride ? Number(profile.ytdOverpaymentOverride) : 0,
        };
        const ytd = computeYTD(priorReceipts, computed, overrides);

        const receipt = await prisma.payReceipt.upsert({
            where: { employeeId_periodStart: { employeeId: input.employeeId, periodStart: start } },
            create: {
                employeeId: input.employeeId,
                periodStart: start,
                periodEnd: end,
                payDate: payDt,
                totalHours: input.totalHours,
                hourlyRate: input.hourlyRate,
                grossEarnings: computed.grossEarnings,
                garnishment: computed.garnishment,
                childSupport: computed.childSupport,
                overpaymentDeduction: computed.overpaymentDeduction,
                otherDeductions: computed.otherDeductions,
                netPay: computed.netPay,
                ...ytd,
                classification: profile.classification,
                status: shouldSend ? 'sent' : 'draft',
                notes: input.notes || '',
            },
            update: {
                periodEnd: end,
                payDate: payDt,
                totalHours: input.totalHours,
                hourlyRate: input.hourlyRate,
                grossEarnings: computed.grossEarnings,
                garnishment: computed.garnishment,
                childSupport: computed.childSupport,
                overpaymentDeduction: computed.overpaymentDeduction,
                otherDeductions: computed.otherDeductions,
                netPay: computed.netPay,
                ...ytd,
                classification: profile.classification,
                status: shouldSend ? 'sent' : 'draft',
                notes: input.notes || '',
            },
        });

        if (Math.abs(computed.overpaymentDeduction) > 0) {
            await prisma.payrollProfile.update({
                where: { employeeId: input.employeeId },
                data: { overpaymentBalance: { decrement: Math.abs(computed.overpaymentDeduction) } },
            });
        }

        if (shouldSend && profile.employee.email) {
            try {
                await sendReceiptEmail(receipt, profile);
                await prisma.payReceipt.update({
                    where: { id: receipt.id },
                    data: { emailSentAt: new Date() },
                });
            } catch (err) {
                console.error(`Failed to email receipt to ${profile.employee.email}:`, err.message);
            }
        }

        created.push(receipt);
        audit.logAction(req.user.id, req.user.name, req.user.role, 'CREATE', 'PayReceipt', receipt.id, profile.employee.name, [], {});
    }

    res.json(created);
}

async function updateReceipt(req, res) {
    const { id } = req.params;
    const receipt = await prisma.payReceipt.findUnique({ where: { id: Number(id) } });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.status !== 'draft') return res.status(400).json({ error: 'Only draft receipts can be edited' });

    const data = req.body;
    const updated = await prisma.payReceipt.update({ where: { id: Number(id) }, data });
    audit.logAction(req.user.id, req.user.name, req.user.role, 'UPDATE', 'PayReceipt', updated.id, '', [], {});
    res.json(updated);
}

async function finalizeReceipts(req, res) {
    const { ids } = req.body;
    await prisma.payReceipt.updateMany({
        where: { id: { in: ids.map(Number) }, status: 'draft' },
        data: { status: 'finalized' },
    });
    res.json({ success: true });
}

async function sendReceipts(req, res) {
    const { ids } = req.body;
    const receipts = await prisma.payReceipt.findMany({
        where: { id: { in: ids.map(Number) }, status: { in: ['finalized', 'sent'] } },
        include: { employee: { select: { id: true, name: true, email: true, address: true } } },
    });

    const results = [];
    for (const receipt of receipts) {
        const profile = await prisma.payrollProfile.findUnique({ where: { employeeId: receipt.employeeId } });
        if (!receipt.employee.email) {
            results.push({ id: receipt.id, success: false, reason: 'No email' });
            continue;
        }
        try {
            await sendReceiptEmail(receipt, { ...profile, employee: receipt.employee });
            await prisma.payReceipt.update({
                where: { id: receipt.id },
                data: { status: 'sent', emailSentAt: new Date() },
            });
            results.push({ id: receipt.id, success: true });
        } catch (err) {
            results.push({ id: receipt.id, success: false, reason: err.message });
        }
    }
    res.json(results);
}

async function downloadReceiptPdf(req, res) {
    const { id } = req.params;
    const receipt = await prisma.payReceipt.findUnique({
        where: { id: Number(id) },
        include: { employee: { select: { id: true, name: true, email: true, address: true } } },
    });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const profile = await prisma.payrollProfile.findUnique({ where: { employeeId: receipt.employeeId } });

    const pdfData = {
        employee: receipt.employee,
        ssn: profile ? maskSSN(decrypt(profile.ssn)) : '',
        ein: profile ? maskEIN(decrypt(profile.ein)) : '',
        accountNumber: profile ? profile.accountNumber : '',
        classification: receipt.classification,
        periodStart: receipt.periodStart,
        periodEnd: receipt.periodEnd,
        payDate: receipt.payDate,
        totalHours: Number(receipt.totalHours),
        hourlyRate: Number(receipt.hourlyRate),
        grossEarnings: Number(receipt.grossEarnings),
        garnishment: Number(receipt.garnishment),
        childSupport: Number(receipt.childSupport),
        overpaymentDeduction: Number(receipt.overpaymentDeduction),
        otherDeductions: Number(receipt.otherDeductions),
        netPay: Number(receipt.netPay),
        ytdGross: Number(receipt.ytdGross),
        ytdDeductions: Number(receipt.ytdDeductions),
        ytdOverpayments: Number(receipt.ytdOverpayments),
        ytdNet: Number(receipt.ytdNet),
    };

    const buffer = await generateReceiptPdf(pdfData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="paystub-${receipt.employee.name.replace(/\s+/g, '-')}-${receipt.periodStart.toISOString().slice(0, 10)}.pdf"`);
    res.send(buffer);
}

async function sendReceiptEmail(receipt, profile) {
    const pdfData = {
        employee: profile.employee,
        ssn: maskSSN(decrypt(profile.ssn || '')),
        ein: maskEIN(decrypt(profile.ein || '')),
        accountNumber: profile.accountNumber || '',
        classification: receipt.classification,
        periodStart: receipt.periodStart,
        periodEnd: receipt.periodEnd,
        payDate: receipt.payDate,
        totalHours: Number(receipt.totalHours),
        hourlyRate: Number(receipt.hourlyRate),
        grossEarnings: Number(receipt.grossEarnings),
        garnishment: Number(receipt.garnishment),
        childSupport: Number(receipt.childSupport),
        overpaymentDeduction: Number(receipt.overpaymentDeduction),
        otherDeductions: Number(receipt.otherDeductions),
        netPay: Number(receipt.netPay),
        ytdGross: Number(receipt.ytdGross),
        ytdDeductions: Number(receipt.ytdDeductions),
        ytdOverpayments: Number(receipt.ytdOverpayments),
        ytdNet: Number(receipt.ytdNet),
    };
    const buffer = await generateReceiptPdf(pdfData);

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const periodLabel = `${fmtDate(receipt.periodStart)} - ${fmtDate(receipt.periodEnd)}`;
    const name = profile.employee.name;

    const text = `Hi ${name},\n\nWe've attached your paystub for this pay period ${periodLabel}\nThank you for being a part of our team!\n\nNevada Best PCA, LLC\n`;
    const html = `<p>Hi ${name},</p><p>We've attached your paystub for this pay period ${periodLabel}<br>Thank you for being a part of our team!</p><p>Nevada Best PCA, LLC</p>`;

    await sendEmail(
        profile.employee.email,
        'Nevada Best PCA / Payroll services',
        html,
        text,
        [{ content: buffer.toString('base64'), name: `paystub-${name.replace(/\s+/g, '-')}-${receipt.periodStart.toISOString().slice(0, 10)}.pdf` }]
    );
}

module.exports = { listReceipts, previewReceipts, generateReceipts, updateReceipt, finalizeReceipts, sendReceipts, downloadReceiptPdf };
