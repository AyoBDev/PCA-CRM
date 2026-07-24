const { SERVICE_DEFAULTS } = require('../src/lib/serviceDefaults');

const DEFAULT_INSURANCE_TYPES = ['MEDICAID', 'Molina', 'SilverSummit', 'CareSource', 'Aging and Disability', 'CognitiveCare', 'Private Pay', 'Other'];

const DEFAULT_TRIGGERS = [
  { name: 'Authorization Expiry Warning', type: 'auth_expiry', thresholdDays: 30, urgency: 'high' },
  { name: 'Overdue Timesheet Follow-up', type: 'timesheet_overdue', thresholdDays: 1, urgency: 'medium' },
  { name: 'Credential Expiry Warning', type: 'credential_expiry', thresholdDays: 14, urgency: 'high' },
  // Shift replacement auto-offering. Seeded DISABLED: it messages
  // caregivers without a human in the loop, so it must be switched on
  // deliberately once the ranking has been validated against real
  // callouts. thresholdDays carries responseWindowMinutes here.
  { name: 'Shift Replacement', type: 'shift_replacement', thresholdDays: 10, urgency: 'high', enabled: false },
];

async function seedAgencyDefaults(prisma, agencyId) {
  for (const name of DEFAULT_INSURANCE_TYPES) {
    await prisma.insuranceType.upsert({
      where: { agencyId_name: { agencyId, name } },
      update: {},
      create: { name, agencyId },
    });
  }
  // Create-missing-only — never overwrite an existing (possibly admin-edited)
  // row. Mirrors prisma/seed-services.js's seedServices(); kept inline here
  // (rather than requiring that file) since both are called from prisma/ and
  // this avoids a circular require between the two seed scripts.
  for (const [code, d] of Object.entries(SERVICE_DEFAULTS)) {
    const existing = await prisma.service.findUnique({ where: { agencyId_code: { agencyId, code } } });
    if (existing) continue;
    await prisma.service.create({ data: { code, agencyId, ...d } });
  }
  for (const trigger of DEFAULT_TRIGGERS) {
    const existing = await prisma.workflowTrigger.findFirst({ where: { type: trigger.type, agencyId } });
    if (!existing) await prisma.workflowTrigger.create({ data: { ...trigger, agencyId } });
  }
  const folderTree = [
    { name: 'Insurance', subs: ['Medicaid', 'UnitedHealth', 'Blue Cross Blue Shield', 'Aetna'] },
    { name: 'Eligibility', subs: ['Active', 'Pending', 'Expired'] },
  ];
  for (const folder of folderTree) {
    let root = await prisma.adminFolder.findFirst({ where: { name: folder.name, parentId: null, agencyId } });
    if (!root) {
      root = await prisma.adminFolder.create({ data: { name: folder.name, path: `/${folder.name}`, parentId: null, agencyId } });
      for (const sub of folder.subs) {
        await prisma.adminFolder.create({ data: { name: sub, path: `/${folder.name}/${sub}`, parentId: root.id, agencyId } });
      }
    }
  }
}

module.exports = { seedAgencyDefaults };
