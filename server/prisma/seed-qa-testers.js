// ─────────────────────────────────────────────────────────────────────────────
// QA TESTER SEED — deploy-time, OPT-IN, idempotent.
//
// Purpose: create a small set of clearly-labeled "[QA]" test accounts in ANY
// environment (including production) so a tester can log into the employee
// portal and exercise each feature area, in both empty and non-empty states:
//   • Onboarding flow          → onboard@qa.test  (invitation_pending + requirement ledger)
//   • Shifts / schedule        → active@qa.test   (active, has shifts this week)
//   • Timesheet                → active@qa.test   (has a permanent link + a draft timesheet)
//   • Certification reminders  → active@qa.test   (certs with expiring/expired dates)
//   • Empty states             → empty@qa.test    (active, nothing assigned)
//
// MULTI-TENANCY: all QA data is scoped to agency #1 (the default agency). The
//   agency is resolved on the OWNER connection first (a pre-context bootstrap
//   step, mirroring seed.js), then every seed/clean operation runs inside
//   runWithTenant() using a tenant-scoped client so RLS applies and agencyId is
//   auto-stamped on all creates.
//
// SAFETY:
//   • GATED: only runs when process.env.SEED_QA_TESTERS === 'true'. A normal
//     deploy skips it entirely — no surprise test data in prod.
//   • IDEMPOTENT: every account/client/shift is upsert-or-recreate keyed by a
//     stable identifier, so re-running on each deploy updates rather than
//     duplicates.
//   • LABELED: names/emails are prefixed "[QA]" / "@qa.test" so no one
//     mistakes them for real staff, and they're trivial to find + delete.
//   • SELF-CONTAINED: creates its OWN "[QA] Test Client" — never assigns real
//     clients to the fake employees.
//
// PASSWORD: a fixed known test password (QA_PASSWORD below). These are
//   throwaway accounts with no access to real client data beyond the QA client,
//   so a known credential is an acceptable convenience here. If that ever stops
//   being acceptable, switch to a QA_TESTER_PASSWORD env var.
//
// CLEANUP: run `node prisma/seed-qa-testers.js --clean` (or set SEED_QA_TESTERS
//   to 'clean') to remove every [QA] account, the QA client, and their data.
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { runWithTenant, getTenantDb, getAgencyId } = require('../src/lib/tenantContext');
const { tenantClient, tenantTransaction } = require('../src/lib/tenantPrisma');

// Owner connection — used ONLY to resolve the default agency before we enter a
// tenant context (a pre-context bootstrap step, exactly as seed.js does).
const ownerPrisma = new PrismaClient();

const QA_PASSWORD = 'QATest1234!';
const QA_CLIENT_NAME = '[QA] Test Client';

const TESTERS = [
  { email: 'onboard@qa.test', name: '[QA] Onboarding Tester',  onboardingStatus: 'invitation_pending' },
  { email: 'active@qa.test',  name: '[QA] Active Tester',      onboardingStatus: 'active' },
  { email: 'empty@qa.test',   name: '[QA] Empty-State Tester', onboardingStatus: 'active' },
];

function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function weekSundayUTC() {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); d.setUTCHours(0, 0, 0, 0); return d;
}
function dayInThisWeek(offset) { const s = weekSundayUTC(); s.setUTCDate(s.getUTCDate() + offset); return s; }

// Create (or refresh) a User + linked Employee for a tester. Returns the employee.
async function upsertTester(t) {
  const prisma = getTenantDb();
  const agencyId = getAgencyId();
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { agencyId_email: { agencyId, email: t.email } },
    update: { passwordHash, name: t.name, role: 'pca', active: true, status: 'active', archivedAt: null },
    create: { email: t.email, passwordHash, name: t.name, role: 'pca', active: true, status: 'active' },
  });
  let employee = await prisma.employee.findUnique({ where: { userId: user.id } });
  if (employee) {
    employee = await prisma.employee.update({
      where: { id: employee.id },
      data: { name: t.name, email: t.email, active: true, status: 'active', onboardingStatus: t.onboardingStatus },
    });
  } else {
    employee = await prisma.employee.create({
      data: { name: t.name, email: t.email, active: true, status: 'active', onboardingStatus: t.onboardingStatus, userId: user.id },
    });
  }
  return { user, employee };
}

async function ensureQaClient() {
  const prisma = getTenantDb();
  const existing = await prisma.client.findFirst({ where: { clientName: QA_CLIENT_NAME } });
  const data = {
    mainServices: 'Light Housekeeping\nGrooming\nMedication Reminders\nMeal Preparation\nCompanionship',
    carePlanSchedule: 'Mon / Wed / Fri mornings, 9:00 AM – 12:00 PM. Saturday check-in call.',
    caregiverRequirements: 'English-speaking. Comfortable with a small dog.',
    address: '123 Test St, Las Vegas, NV 89108',
    phone: '702-555-0100',
  };
  if (existing) return prisma.client.update({ where: { id: existing.id }, data });
  return prisma.client.create({ data: { clientName: QA_CLIENT_NAME, ...data } });
}

// ── ONBOARDING tester: give it a fresh requirement ledger so the onboarding
//    wizard has documents/certs/policies to complete. Uses assignRequirements
//    from the same service the real onboarding flow uses.
async function seedOnboarding(employee) {
  const prisma = getTenantDb();
  const agencyId = getAgencyId();
  const { assignRequirements } = require('../src/services/requirementService');
  // Clear any prior ledger for a clean re-run, then assign a representative set.
  await prisma.employeeRequirement.deleteMany({ where: { employeeId: employee.id } });
  const certTypes = await prisma.certType.findMany({ where: { active: true }, take: 3 });
  const docTypes = await prisma.documentType.findMany({ where: { active: true }, take: 2 });
  const policies = await prisma.policyDocument.findMany({ where: { active: true }, take: 1 });
  // assignRequirements uses `tx` from tenantTransaction, which does NOT
  // auto-stamp creates — so it takes an explicit agencyId (its own contract).
  await tenantTransaction(agencyId, async (tx) => {
    await assignRequirements(tx, employee.id, {
      documentTypeIds: docTypes.map(d => d.id),
      certTypeIds: certTypes.map(c => c.id),
      policyDocumentIds: policies.map(p => p.id),
    }, agencyId);
  });
}

// ── ACTIVE tester: shifts this week + a permanent link & draft timesheet +
//    certifications with a spread of expiry dates (drives the reminder banner).
async function seedActive(employee, client) {
  const prisma = getTenantDb();
  // Shifts (Thu + Fri of the current week)
  await prisma.shift.deleteMany({ where: { employeeId: employee.id, clientId: client.id } });
  for (const offset of [4, 5]) {
    await prisma.shift.create({
      data: { clientId: client.id, employeeId: employee.id, serviceCode: 'PCS',
        shiftDate: dayInThisWeek(offset), startTime: '09:00', endTime: '12:00', status: 'scheduled' },
    });
  }

  // Permanent link + a draft timesheet for the current week
  const link = await prisma.permanentLink.upsert({
    where: { clientId_pcaName: { clientId: client.id, pcaName: employee.name } },
    update: {},
    create: { clientId: client.id, pcaName: employee.name },
  });
  const weekStart = weekSundayUTC();
  const existingTs = await prisma.timesheet.findFirst({
    where: { clientId: client.id, pcaName: employee.name, weekStart },
  });
  if (!existingTs) {
    await prisma.timesheet.create({
      data: { clientId: client.id, pcaName: employee.name, weekStart, status: 'draft' },
    });
  }

  // Certifications: active, expiring-soon, expired, no-file — exercises the
  // certification reminder / compliance banner. Ledger-linked so they show on
  // the employee cert page (which is ledger-driven).
  await prisma.employeeRequirement.deleteMany({ where: { employeeId: employee.id, kind: 'certification' } });
  await prisma.employeeCertification.deleteMany({ where: { employeeId: employee.id } });
  const certTypeRows = await prisma.certType.findMany();
  const byKey = Object.fromEntries(certTypeRows.map(t => [t.key, t]));
  const certSpec = [
    { key: 'tb_test',          exp: daysFromNow(200), file: 'tb-test.pdf' },      // active
    { key: 'cpr',              exp: daysFromNow(20),  file: 'cpr.pdf' },          // expiring soon
    { key: 'background_check', exp: daysFromNow(-10), file: 'bg-check.pdf' },     // expired
    { key: 'id_expiration',    exp: null,             file: '' },                 // no file / not set
  ];
  for (const c of certSpec) {
    const cat = byKey[c.key];
    if (!cat) continue;
    const cert = await prisma.employeeCertification.create({
      data: { employeeId: employee.id, certType: c.key, status: 'active', expirationDate: c.exp,
        fileName: c.file, fileSize: c.file ? 12345 : 0, fileType: c.file ? 'application/pdf' : '' },
    });
    await prisma.employeeRequirement.create({
      data: { employeeId: employee.id, kind: 'certification', catalogTypeId: cat.id,
        certificationId: cert.id, status: c.file ? 'submitted' : 'required', reviewStatus: 'approved' },
    });
  }
}

// ── EMPTY tester: active with NOTHING assigned — for verifying empty states.
async function seedEmpty(employee) {
  const prisma = getTenantDb();
  await prisma.shift.deleteMany({ where: { employeeId: employee.id } });
  await prisma.employeeRequirement.deleteMany({ where: { employeeId: employee.id } });
  await prisma.employeeCertification.deleteMany({ where: { employeeId: employee.id } });
}

async function clean() {
  const prisma = getTenantDb();
  const emails = TESTERS.map(t => t.email);
  // Tenant client scopes these filters to agency #1 automatically via RLS.
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const employees = await prisma.employee.findMany({ where: { userId: { in: users.map(u => u.id) } }, select: { id: true } });
  const empIds = employees.map(e => e.id);
  // Cascade deletes handle child rows; delete shifts/certs/reqs/timesheets explicitly to be safe.
  await prisma.shift.deleteMany({ where: { employeeId: { in: empIds } } });
  await prisma.employeeRequirement.deleteMany({ where: { employeeId: { in: empIds } } });
  await prisma.employeeCertification.deleteMany({ where: { employeeId: { in: empIds } } });
  const qaClient = await prisma.client.findFirst({ where: { clientName: QA_CLIENT_NAME } });
  if (qaClient) {
    await prisma.timesheet.deleteMany({ where: { clientId: qaClient.id } });
    await prisma.permanentLink.deleteMany({ where: { clientId: qaClient.id } });
    await prisma.shift.deleteMany({ where: { clientId: qaClient.id } });
    await prisma.client.delete({ where: { id: qaClient.id } });
  }
  await prisma.employee.deleteMany({ where: { id: { in: empIds } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log('🧹 [QA] Removed all QA tester accounts, the QA client, and their data.');
}

async function seed() {
  const client = await ensureQaClient();
  const results = {};
  for (const t of TESTERS) {
    const { employee } = await upsertTester(t);
    results[t.email] = employee.id;
    if (t.email === 'onboard@qa.test') await seedOnboarding(employee);
    else if (t.email === 'active@qa.test') await seedActive(employee, client);
    else if (t.email === 'empty@qa.test') await seedEmpty(employee);
  }

  console.log('✅ [QA] Testers seeded (password for all: ' + QA_PASSWORD + '):');
  console.log('   • onboard@qa.test → onboarding flow (invitation_pending + ledger)');
  console.log('   • active@qa.test  → shifts this week, draft timesheet, certs (active/expiring/expired)');
  console.log('   • empty@qa.test   → empty states (active, nothing assigned)');
  console.log('   QA client: ' + QA_CLIENT_NAME + ' (id ' + client.id + ')');
  console.log('   To remove: run this script with --clean or set SEED_QA_TESTERS=clean.');
}

async function main() {
  const mode = process.env.SEED_QA_TESTERS;
  const cleanRequested = process.argv.includes('--clean') || mode === 'clean';

  if (!cleanRequested && mode !== 'true') {
    console.log('⏭️  [QA] SEED_QA_TESTERS is not "true" — skipping QA tester seed.');
    return;
  }

  // Resolve the default agency on the OWNER connection (pre-context bootstrap),
  // mirroring seed.js: prefer NVBEST_AGENCY_SLUG, else the oldest agency.
  const slug = process.env.NVBEST_AGENCY_SLUG;
  const agency = slug
    ? await ownerPrisma.agency.findFirst({ where: { slug }, orderBy: { id: 'asc' } })
      || await ownerPrisma.agency.findFirst({ orderBy: { id: 'asc' } })
    : await ownerPrisma.agency.findFirst({ orderBy: { id: 'asc' } });
  if (!agency) {
    throw new Error('[QA] No agency found — run `npm run db:seed` first to create the default agency.');
  }

  // Everything else runs inside agency #1's tenant context: RLS applies and
  // top-level creates auto-stamp agencyId.
  await runWithTenant({ agencyId: agency.id, db: tenantClient(agency.id) }, async () => {
    if (cleanRequested) { await clean(); return; }
    await seed();
  });
}

main()
  .catch((e) => { console.error('[QA] Seed failed:', e); process.exit(1); })
  .finally(() => ownerPrisma.$disconnect());
