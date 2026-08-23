module.exports = {
  testMatch: ['**/*.itest.js'],
  globalSetup: '<rootDir>/src/__integration__/globalSetup.js',
  setupFiles: ['<rootDir>/src/__integration__/setupEnv.js'],
  testTimeout: 30000,
};
