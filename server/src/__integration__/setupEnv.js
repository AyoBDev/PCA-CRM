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
