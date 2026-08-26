const { encrypt, decrypt, maskSSN, maskEIN } = require('../services/encryptionService');
const audit = require('../services/auditService');

async function getPayrollProfile(req, res) {
    const { employeeId } = req.params;
    const profile = await req.db.payrollProfile.findUnique({
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
    const profile = await req.db.payrollProfile.findUnique({
        where: { employeeId: Number(employeeId) },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    // HIPAA/PII traceability: record every full decryption of an SSN/EIN so
    // there is an audit trail of who viewed the raw value and when.
    audit.logAction({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'REVEAL', entityType: 'PayrollProfile', entityId: profile.id,
        entityName: `Employee #${employeeId}`, metadata: { field },
    });
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

    const existing = await req.db.payrollProfile.findUnique({ where: { employeeId: empId } });

    let profile;
    if (existing) {
        profile = await req.db.payrollProfile.update({
            where: { employeeId: empId },
            data,
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'PayrollProfile', entityId: profile.id, entityName: `Employee #${empId}` });
    } else {
        profile = await req.db.payrollProfile.create({
            data: { employeeId: empId, ...data },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'PayrollProfile', entityId: profile.id, entityName: `Employee #${empId}` });
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
