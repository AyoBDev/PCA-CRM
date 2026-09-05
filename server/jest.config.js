module.exports = {
  // Jest's default testMatch would treat everything under __tests__/ as a
  // test suite, including shared test helpers (e.g. __tests__/helpers/auth.js)
  // that export functions but contain no tests themselves.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  // Test DB / env setup (merged from main's previously-inline package.json config).
  globalSetup: '<rootDir>/jest.globalSetup.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Jest's 5s default is too tight for this suite and made DB-backed tests
  // flaky — they'd pass serially and intermittently time out in a full run.
  //
  // The tests themselves are fast (the slowest onboarding test is ~200ms
  // serially). The cost is fixed startup that Jest bills to the FIRST test in
  // each file: requiring src/app pulls in the whole Express app, every route,
  // controller, service and Prisma, which measures 1.2-1.5s per worker
  // process, and a beforeAll that hashes a password and logs in adds ~0.8s
  // under parallel load. That left well under half the 5s budget for the test,
  // so ordinary scheduling jitter across 7 workers tipped suites over the edge
  // — onboardingController/onboardingReviews/onboardingReviewDecisions being
  // the usual casualties.
  //
  // 30s is deliberately generous: it is a ceiling for catching genuinely hung
  // tests, not a target. Nothing here should come close, so a test that does
  // time out is a real bug rather than a slow machine.
  testTimeout: 30_000,
};
