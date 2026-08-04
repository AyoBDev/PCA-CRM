const prisma = require('../../lib/prisma');
const onboarding = require('../../services/onboardingService');
const audit = require('../../services/auditService');

async function resolveEmployee(token) {
    const { valid, employee } = await onboarding.validateToken(token);
    if (!valid) return null;
    return employee;
}

async function buildLedgerView(employeeId) {
    const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId } });
    const [docs, certs, policies] = await Promise.all([
        prisma.documentType.findMany(), prisma.certType.findMany(), prisma.policyDocument.findMany(),
    ]);
    const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
    const dMap = byId(docs), cMap = byId(certs), pMap = byId(policies);
    return reqs.map(r => {
        const cat = r.kind === 'document' ? dMap[r.catalogTypeId] : r.kind === 'certification' ? cMap[r.catalogTypeId] : pMap[r.catalogTypeId];
        return { id: r.id, kind: r.kind, catalogTypeId: r.catalogTypeId, status: r.status, label: cat ? (cat.label || cat.title) : '', requiresExpiry: cat ? Boolean(cat.requiresExpiry) : false };
    });
}

async function savePersonal(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        const { address, dob, gender, preferredLanguage, ssn } = req.body;
        await prisma.employee.update({ where: { id: employee.id }, data: { address, dob, gender, preferredLanguage, ssn } });
        // Public (token-auth) mutation → userId 0. Log only which fields were touched, never PHI values (dob/ssn).
        const fields = Object.keys({ address, dob, gender, preferredLanguage, ssn }).filter((k) => req.body[k] !== undefined);
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_personal_saved', fields } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function saveEmergency(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        const { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } = req.body;
        await prisma.employee.update({ where: { id: employee.id }, data: { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_emergency_saved' } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { savePersonal, saveEmergency, buildLedgerView };
