const prisma = require('../../lib/prisma');
const onboarding = require('../../services/onboardingService');

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
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function saveEmergency(req, res, next) {
    try {
        const employee = await resolveEmployee(req.params.token);
        if (!employee) return res.status(400).json({ error: 'Invalid link' });
        const { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } = req.body;
        await prisma.employee.update({ where: { id: employee.id }, data: { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { savePersonal, saveEmergency, buildLedgerView };
