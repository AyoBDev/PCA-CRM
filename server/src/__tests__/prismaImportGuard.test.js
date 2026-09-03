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
  // Demo-agency provisioning: creates the agency row itself, so it necessarily
  // runs before any tenant context for that agency can exist — same shape as
  // platformController's createAgency. Every write passes an explicit agencyId,
  // and its one delete is a slug-pinned agency.delete (see the SAFETY note in
  // the service).
  'src/services/demoAgencyService.js',
  'src/services/auditService.js',           // fire-and-forget writes w/ explicit agencyId
  // Public-token resolvers: token lookup crosses tenants by design. Their
  // authenticated handlers (if any) use req.db — see git blame for the split.
  'src/controllers/pcaFormController.js',
  'src/controllers/signingController.js',
  'src/controllers/scheduleNotificationController.js',
  'src/controllers/employeeScheduleLinkController.js',
  // getOffer/respondToOffer are public shift-offer token routes: the token
  // resolves to an agencyId on the owner connection, then enterTokenTenant
  // switches to that agency's req.db for everything else in the handler.
  'src/controllers/replacementController.js',
  // Public-token endpoints (no tenant context yet — Task 10 wires that).
  // Queries are explicitly scoped by the already-loaded employee's agencyId
  // instead of req.db/getTenantDb(). The admin-authenticated handlers in
  // onboardingController.js (resendInvite, getOnboardingReviews, etc.) use
  // req.db, not this import.
  'src/services/onboardingService.js',
  'src/controllers/onboardingController.js',
  // Cron drivers: enumerate active agencies on the owner connection, then run
  // each job body inside runWithTenant with a per-agency tenantClient.
  'src/jobs/taskReminders.js',
  'src/jobs/taskTriggers.js',
  'src/jobs/timesheetReminders.js',
  'src/jobs/leadDormancySweep.js',
  'src/jobs/certReminderCron.js',
  // Same cron-driver shape as the jobs above, just living under services/:
  // enumerates active agencies on the owner connection, then runs the
  // per-agency geocode backfill inside runWithTenant with a tenantClient.
  'src/services/geocodeBackfill.js',
  // Cron-driver-shaped, but per-job rather than per-agency-sweep: BullMQ job
  // payloads carry no agencyId, so this worker resolves the offer's agency
  // on the owner connection first, then runs entirely inside runWithTenant
  // with a per-agency tenantClient (see replacementWorker.js top comment).
  'src/workers/replacementWorker.js',
]);

test('only allowlisted files import lib/prisma', () => {
  const serverRoot = path.join(__dirname, '../..');
  let out = '';
  try {
    // Match any reference to the lib/prisma module regardless of quote style
    // ("lib/prisma", 'lib/prisma') or an explicit .js suffix
    // ("lib/prisma.js"). -n gives file:line:content so we can keep only
    // require()/import lines below.
    out = execSync(`grep -rn "lib/prisma" src --include='*.js'`, { cwd: serverRoot }).toString();
  } catch (e) {
    out = e.stdout ? e.stdout.toString() : '';
  }
  const IMPORT_RE = /\b(?:require\s*\(|import\b|from\b)/;
  const offenders = [...new Set(
    out.split('\n').filter(Boolean)
      // grep -n output is "path:line:content" — split off the path
      .map((line) => {
        const [file, , ...rest] = line.split(':');
        return { file, content: rest.join(':') };
      })
      // Only count actual import/require statements, not comments/strings
      .filter(({ content }) => IMPORT_RE.test(content))
      .map(({ file }) => file)
  )]
    .filter((f) => !f.includes('__tests__') && !f.includes('__integration__'))
    .filter((f) => !ALLOWLIST.has(f));
  expect(offenders).toEqual([]);
});
