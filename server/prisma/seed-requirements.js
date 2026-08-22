const defaultPrisma = require('../src/lib/prisma');

const DEFAULT_DOCUMENT_TYPES = [
  { key: 'government_id', label: 'Government ID', requiresExpiry: true, sortOrder: 1 },
  { key: 'drivers_license', label: "Driver's License", requiresExpiry: true, sortOrder: 2 },
  { key: 'work_authorization', label: 'Work Authorization', requiresExpiry: true, sortOrder: 3 },
  { key: 'insurance', label: 'Insurance', requiresExpiry: true, sortOrder: 4 },
  { key: 'background_check_doc', label: 'Background Check', requiresExpiry: false, sortOrder: 5 },
];

const DEFAULT_CERT_TYPES = [
  { key: 'id_expiration', label: 'ID Expiration', renewalYears: null, requiresExpiry: true, sortOrder: 1 },
  { key: 'tb_test', label: 'TB Test', renewalYears: 1, requiresExpiry: true, sortOrder: 2 },
  { key: 'cpr', label: 'CPR', renewalYears: 2, requiresExpiry: true, sortOrder: 3 },
  { key: 'annual_training', label: '8hr Annual Training', renewalYears: 1, requiresExpiry: true, sortOrder: 4 },
  { key: 'background_check', label: 'Background Check', renewalYears: 5, requiresExpiry: true, sortOrder: 5 },
];

const DEFAULT_POLICIES = [
  { key: 'employee_handbook', title: 'Employee Handbook', sortOrder: 1 },
  { key: 'hipaa_agreement', title: 'HIPAA Agreement', sortOrder: 2 },
  { key: 'confidentiality_agreement', title: 'Confidentiality Agreement', sortOrder: 3 },
  { key: 'code_of_conduct', title: 'Code of Conduct', sortOrder: 4 },
  { key: 'privacy_policy', title: 'Privacy Policy', sortOrder: 5 },
];

// Requirement catalogs (document/cert/policy types) are agency-scoped —
// mirrors seedServices()/seedAgencyDefaults(): create-missing-only, never
// overwrites an existing (possibly admin-edited) row.
async function createMissing(model, rows, agencyId) {
  let created = 0;
  for (const row of rows) {
    const existing = await model.findUnique({ where: { agencyId_key: { agencyId, key: row.key } } });
    if (!existing) { await model.create({ data: { ...row, agencyId } }); created++; }
  }
  return created;
}

async function seedRequirements(prisma = defaultPrisma, agencyId) {
  if (!Number.isInteger(agencyId)) {
    throw new Error('seedRequirements requires an agencyId — requirement catalogs are agency-scoped');
  }
  const documentTypes = await createMissing(prisma.documentType, DEFAULT_DOCUMENT_TYPES, agencyId);
  const certTypes = await createMissing(prisma.certType, DEFAULT_CERT_TYPES, agencyId);
  const policyDocuments = await createMissing(prisma.policyDocument, DEFAULT_POLICIES, agencyId);
  return { documentTypes, certTypes, policyDocuments };
}

module.exports = { seedRequirements, DEFAULT_DOCUMENT_TYPES, DEFAULT_CERT_TYPES, DEFAULT_POLICIES };

if (require.main === module) {
  (async () => {
    const agency = await defaultPrisma.agency.findFirst({ orderBy: { id: 'asc' } });
    if (!agency) throw new Error('No agency found — run prisma/seed.js first');
    const r = await seedRequirements(defaultPrisma, agency.id);
    console.log('Seeded requirements:', r);
    await defaultPrisma.$disconnect();
  })();
}
