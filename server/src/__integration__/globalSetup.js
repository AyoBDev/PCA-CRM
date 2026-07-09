const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const testDbUrl = 'postgresql://mac@localhost:5432/nvbestpca_test';
  const env = {
    ...process.env,
    DATABASE_URL: testDbUrl,
    TEST_DATABASE_URL: testDbUrl,
  };

  // create the test DB if missing (ignore "already exists")
  try {
    execSync('createdb nvbestpca_test', { stdio: 'pipe' });
  } catch (err) {
    if (!String(err.stderr).includes('already exists')) throw err;
  }
  const serverDir = path.join(__dirname, '/../..');
  const prismaBinary = path.join(serverDir, 'node_modules/.bin/prisma');
  execSync(`${prismaBinary} migrate deploy`, {
    cwd: serverDir,
    env,
    stdio: 'inherit',
  });
};
