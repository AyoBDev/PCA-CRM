const prisma = require('../src/lib/prisma');

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

async function createMissing(model, rows) {
  let created = 0;
  for (const row of rows) {
    const existing = await model.findUnique({ where: { key: row.key } });
    if (!existing) { await model.create({ data: row }); created++; }
  }
  return created;
}

async function seedRequirements() {
  const documentTypes = await createMissing(prisma.documentType, DEFAULT_DOCUMENT_TYPES);
  const certTypes = await createMissing(prisma.certType, DEFAULT_CERT_TYPES);
  const policyDocuments = await createMissing(prisma.policyDocument, DEFAULT_POLICIES);
  return { documentTypes, certTypes, policyDocuments };
}

module.exports = { seedRequirements, DEFAULT_DOCUMENT_TYPES, DEFAULT_CERT_TYPES, DEFAULT_POLICIES };

if (require.main === module) {
  seedRequirements().then(r => { console.log('Seeded requirements:', r); return prisma.$disconnect(); });
}
