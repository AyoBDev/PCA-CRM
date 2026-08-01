process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://mac@localhost:5432/nvbestpca_test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_DB_PASSWORD = process.env.APP_DB_PASSWORD || 'app_password';
process.env.APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ||
  `postgresql://app_user:${process.env.APP_DB_PASSWORD}@localhost:5432/nvbestpca_test`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.BASE_DOMAIN = 'localhost';
process.env.NODE_ENV = 'test';
// PHI-at-rest encryption key — required so PHI-field writes (Client.medicaidId/
// dob/notes/pcaNotes, Employee.dob/notes, HospitalVisit.*) don't throw under
// test. Fixed value keeps integration runs deterministic across machines.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'e'.repeat(64);
process.env.INTEGRITY_KEY = process.env.INTEGRITY_KEY || 'f'.repeat(64);
