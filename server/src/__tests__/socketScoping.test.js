const { employeeRoom, officeRoom } = require('../socket');
const { corsOrigin } = require('../app');

test('room names are agency-prefixed', () => {
  expect(employeeRoom(3, 17)).toBe('agency:3:employee:17');
  expect(officeRoom(3)).toBe('agency:3:office');
});

describe('corsOrigin', () => {
  beforeAll(() => { process.env.BASE_DOMAIN = 'nvbestpca.com'; });
  function check(origin) {
    return new Promise((resolve) => corsOrigin(origin, (err, ok) => resolve(!err && !!ok)));
  }
  test('allows agency subdomains', async () => {
    expect(await check('https://acme.nvbestpca.com')).toBe(true);
    expect(await check('https://nvbestpca.com')).toBe(true);
  });
  test('allows localhost dev origins', async () => {
    expect(await check('http://acme.localhost:5173')).toBe(true);
    expect(await check('http://localhost:5173')).toBe(true);
  });
  test('rejects foreign origins', async () => {
    expect(await check('https://evil.com')).toBe(false);
    expect(await check('https://nvbestpca.com.evil.com')).toBe(false);
  });
});
