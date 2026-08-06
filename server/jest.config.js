module.exports = {
  // Jest's default testMatch would treat everything under __tests__/ as a
  // test suite, including shared test helpers (e.g. __tests__/helpers/auth.js)
  // that export functions but contain no tests themselves.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  // Test DB / env setup (merged from main's previously-inline package.json config).
  setupFiles: ['<rootDir>/jest.setup.js'],
};
