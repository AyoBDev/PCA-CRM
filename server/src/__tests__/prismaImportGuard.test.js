const { execSync } = require('child_process');
const path = require('path');

// Files allowed to touch the owner-connection system client. Everything else
// must use req.db (controllers) or getTenantDb() (services).
const ALLOWLIST = new Set([
  'src/lib/prisma.js',
  'src/lib/tenantPrisma.js',
  'src/middleware/authMiddleware.js',
  'src/middleware/resolveAgency.js',
  'src/middleware/tenantMiddleware.js',
  'src/controllers/authController.js',      // login/tenant resolution (pre-JWT)
  'src/controllers/platformController.js',  // superadmin console (Task 11)
  'src/controllers/backupController.js',    // platform backup path (Task 11)
  'src/services/auditService.js',           // fire-and-forget writes w/ explicit agencyId
  'src/socket.js',                          // handshake auth (pre-context)
  // Public-token resolvers: token lookup crosses tenants by design.
  'src/controllers/pcaFormController.js',
  'src/controllers/signingController.js',
  'src/controllers/permanentLinkController.js',
  'src/controllers/scheduleNotificationController.js',
  'src/controllers/onboardingController.js',
  'src/controllers/employeeScheduleLinkController.js',
  // Called from onboardingController's public-token endpoints (no tenant
  // context yet — Task 10 wires that). Queries are explicitly scoped by the
  // already-loaded employee's agencyId instead of req.db/getTenantDb().
  'src/services/onboardingService.js',
  // Cron drivers: enumerate active agencies on the owner connection, then run
  // each job body inside runWithTenant with a per-agency tenantClient.
  'src/jobs/complianceCron.js',
  'src/jobs/taskReminders.js',
  'src/jobs/taskTriggers.js',
  'src/jobs/timesheetReminders.js',
]);

test('only allowlisted files import lib/prisma', () => {
  const serverRoot = path.join(__dirname, '../..');
  let out = '';
  try {
    out = execSync(`grep -rl "lib/prisma'" src --include='*.js'`, { cwd: serverRoot }).toString();
  } catch (e) {
    out = e.stdout ? e.stdout.toString() : '';
  }
  const offenders = out.split('\n').filter(Boolean)
    .filter((f) => !f.includes('__tests__') && !f.includes('__integration__'))
    .filter((f) => !ALLOWLIST.has(f));
  expect(offenders).toEqual([]);
});
