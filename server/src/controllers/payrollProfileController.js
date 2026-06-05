const prisma = require('../lib/prisma');
const { encrypt, decrypt, maskSSN, maskEIN } = require('../services/encryptionService');
const audit = require('../services/auditService');

async function getPayrollProfile(req, res) {
    const { employeeId } = req.params;
    const profile = await prisma.payrollProfile.findUnique({
        where: { employeeId: Number(employeeId) },
    });
    if (!profile) return res.json(null);
    res.json({
        ...profile,
        ssn: maskSSN(decrypt(profile.ssn)),
        ein: maskEIN(decrypt(profile.ein)),
        hourlyRate: Number(profile.hourlyRate),
        childSupportAmount: Number(profile.childSupportAmount),
        overpaymentBalance: Number(profile.overpaymentBalance),
        ytdGrossOverride: profile.ytdGrossOverride ? Number(profile.ytdGrossOverride) : null,
        ytdDeductionsOverride: profile.ytdDeductionsOverride ? Number(profile.ytdDeductionsOverride) : null,
        ytdNetOverride: profile.ytdNetOverride ? Number(profile.ytdNetOverride) : null,
        ytdOverpaymentOverride: profile.ytdOverpaymentOverride ? Number(profile.ytdOverpaymentOverride) : null,
    });
}

async function revealSensitiveField(req, res) {
    const { employeeId } = req.params;
    const { field } = req.query;
    if (!['ssn', 'ein'].includes(field)) return res.status(400).json({ error: 'Invalid field' });
    const profile = await prisma.payrollProfile.findUnique({
        where: { employeeId: Number(employeeId) },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({ value: decrypt(profile[field]) });
}

async function upsertPayrollProfile(req, res) {
    const { employeeId } = req.params;
    const empId = Number(employeeId);
    const data = { ...req.body };

    if (data.ssn !== undefined) data.ssn = encrypt(data.ssn);
    if (data.ein !== undefined) data.ein = encrypt(data.ein);
    if (data.hourlyRate !== undefined) data.hourlyRate = Number(data.hourlyRate);
    if (data.childSupportAmount !== undefined) data.childSupportAmount = Number(data.childSupportAmount);
    if (data.overpaymentBalance !== undefined) data.overpaymentBalance = Number(data.overpaymentBalance);

    const existing = await prisma.payrollProfile.findUnique({ where: { employeeId: empId } });

    let profile;
    if (existing) {
        profile = await prisma.payrollProfile.update({
            where: { employeeId: empId },
            data,
        });
        audit.logAction(req.user.id, req.user.name, req.user.role, 'UPDATE', 'PayrollProfile', profile.id, `Employee #${empId}`, [], {});
    } else {
        profile = await prisma.payrollProfile.create({
            data: { employeeId: empId, ...data },
        });
        audit.logAction(req.user.id, req.user.name, req.user.role, 'CREATE', 'PayrollProfile', profile.id, `Employee #${empId}`, [], {});
    }

    res.json({
        ...profile,
        ssn: maskSSN(decrypt(profile.ssn)),
        ein: maskEIN(decrypt(profile.ein)),
        hourlyRate: Number(profile.hourlyRate),
        childSupportAmount: Number(profile.childSupportAmount),
        overpaymentBalance: Number(profile.overpaymentBalance),
    });
}

module.exports = { getPayrollProfile, upsertPayrollProfile, revealSensitiveField };
