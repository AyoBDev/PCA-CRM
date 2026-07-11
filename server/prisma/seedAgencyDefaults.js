const DEFAULT_INSURANCE_TYPES = ['MEDICAID', 'Molina', 'SilverSummit', 'CareSource', 'Aging and Disability', 'CognitiveCare', 'Private Pay', 'Other'];

const DEFAULT_SERVICES = [
  { category: 'PCS', code: 'S5120', name: 'Chore Services' },
  { category: 'PCS', code: 'S5130', name: 'Homemaker' },
  { category: 'PCS', code: 'S5125', name: 'Attendant Care' },
  { category: 'PCS', code: 'S5150', name: 'Unskilled Respite Care' },
  { category: 'SDPC', code: 'SDPC', name: 'Self-Directed Personal Care' },
  { category: 'TIMESHEETS', code: 'TIMESHEETS', name: 'Timesheet (Private)' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_PCS', name: 'Timesheet – Personal Care Services (PCS)' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_HOMEMAKER', name: 'Timesheet – Homemaker' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_RESPITE', name: 'Timesheet – Respite' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_COMPANION', name: 'Timesheet – Companion' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_CHORE', name: 'Timesheet – Chore' },
  { category: 'COPE', code: 'COPE', name: 'COPE' },
  { category: 'PAS', code: 'PAS', name: 'Personal Assistance Services' },
];

const DEFAULT_TRIGGERS = [
  { name: 'Authorization Expiry Warning', type: 'auth_expiry', thresholdDays: 30, urgency: 'high' },
  { name: 'Overdue Timesheet Follow-up', type: 'timesheet_overdue', thresholdDays: 1, urgency: 'medium' },
  { name: 'Credential Expiry Warning', type: 'credential_expiry', thresholdDays: 14, urgency: 'high' },
];

async function seedAgencyDefaults(prisma, agencyId) {
  for (const name of DEFAULT_INSURANCE_TYPES) {
    await prisma.insuranceType.upsert({
      where: { agencyId_name: { agencyId, name } },
      update: {},
      create: { name, agencyId },
    });
  }
  for (const s of DEFAULT_SERVICES) {
    await prisma.service.upsert({
      where: { agencyId_code: { agencyId, code: s.code } },
      update: { category: s.category, name: s.name },
      create: { ...s, agencyId },
    });
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

module.exports = { seedAgencyDefaults, DEFAULT_SERVICES };
