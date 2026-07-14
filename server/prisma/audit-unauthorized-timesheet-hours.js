/**
 * READ-ONLY AUDIT — Unauthorized timesheet section hours.
 *
 * Finds timesheet entries that hold hours in a service section (PAS / Homemaker /
 * Respite / Companion) for a week in which the client had NO active authorization
 * for that section. These are the "phantom hours" that inflate totals and can lead
 * to denied claims.
 *
 * This script DOES NOT modify any data. It only reports.
 *
 * Run against production:
 *   railway run node prisma/audit-unauthorized-timesheet-hours.js
 * or locally (uses server/.env DATABASE_URL):
 *   node prisma/audit-unauthorized-timesheet-hours.js
 */
require('dotenv').config();
const prisma = require('../src/lib/prisma');
const serviceRegistry = require('../src/services/serviceRegistry');
const { deriveTimesheetService } = require('../src/lib/timesheetUtils');

// service section -> the entry hours field that stores its hours
const SECTION_HOURS_FIELD = {
  PAS: 'adlHours',
  Homemaker: 'iadlHours',
  Respite: 'respiteHours',
  Companion: 'companionHours',
};

function authActiveForWeek(auth, wsMs, weMs) {
  if ((auth.manualStatus || 'active') !== 'active') return false;
  if (auth.archivedAt) return false;
  if (auth.authorizationStartDate) {
    const sd = new Date(auth.authorizationStartDate);
    if (Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate()) > weMs) return false;
  }
  if (auth.authorizationEndDate) {
    const ed = new Date(auth.authorizationEndDate);
    if (Date.UTC(ed.getUTCFullYear(), ed.getUTCMonth(), ed.getUTCDate()) < wsMs) return false;
  }
  return true;
}

async function main() {
  await serviceRegistry.getServiceMap(); // warm cache so deriveTimesheetService reflects DB

  const timesheets = await prisma.timesheet.findMany({
    where: { archivedAt: null },
    include: {
      client: { select: { id: true, clientName: true } },
      entries: true,
    },
  });

  const findings = [];

  for (const ts of timesheets) {
    const weekStart = new Date(ts.weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const wsMs = Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate());
    const weMs = Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate());

    const auths = await prisma.authorization.findMany({
      where: { clientId: ts.clientId },
      select: { serviceCode: true, serviceName: true, serviceCategory: true, authorizedUnits: true, authorizationStartDate: true, authorizationEndDate: true, manualStatus: true, archivedAt: true },
    });
    const authorized = new Set();
    for (const a of auths) {
      if (!authActiveForWeek(a, wsMs, weMs)) continue;
      const svc = deriveTimesheetService(a);
      if (svc) authorized.add(svc);
    }

    // Sum hours per section across all entries in this timesheet
    const sectionHours = { PAS: 0, Homemaker: 0, Respite: 0, Companion: 0 };
    for (const e of ts.entries) {
      for (const [section, field] of Object.entries(SECTION_HOURS_FIELD)) {
        sectionHours[section] += e[field] || 0;
      }
    }

    for (const [section, hours] of Object.entries(sectionHours)) {
      if (hours > 0 && !authorized.has(section)) {
        findings.push({
          timesheetId: ts.id,
          clientId: ts.client?.id,
          clientName: ts.client?.clientName,
          pcaName: ts.pcaName,
          weekStart: weekStart.toISOString().slice(0, 10),
          status: ts.status,
          section,
          unauthorizedHours: Math.round(hours * 100) / 100,
          authorizedSections: [...authorized].sort().join(', ') || '(none)',
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log('\n✅ No unauthorized-section hours found. All timesheet hours are backed by an active authorization for their week.\n');
  } else {
    console.log(`\n⚠️  Found ${findings.length} timesheet/section combinations with hours but NO matching authorization:\n`);
    console.table(findings);
    const totalHrs = findings.reduce((s, f) => s + f.unauthorizedHours, 0);
    console.log(`\nTotal unauthorized hours across all findings: ${Math.round(totalHrs * 100) / 100} hrs`);
    console.log('\nThis report is READ-ONLY. No data was changed.');
    console.log('To clean a record: the hours clear automatically the next time that PCA form is opened and saved,');
    console.log('since the server now strips unauthorized-section hours on save.\n');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
