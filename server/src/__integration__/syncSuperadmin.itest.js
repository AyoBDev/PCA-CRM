const bcrypt = require('bcryptjs');
const { systemPrisma } = require('./helpers');
const { syncSuperadmin } = require('../../prisma/seed');

const ORIGINAL_ENV = { ...process.env };

afterEach(async () => {
  process.env.SUPERADMIN_EMAIL = ORIGINAL_ENV.SUPERADMIN_EMAIL;
  process.env.SUPERADMIN_PASSWORD = ORIGINAL_ENV.SUPERADMIN_PASSWORD;
  if (ORIGINAL_ENV.SUPERADMIN_EMAIL === undefined) delete process.env.SUPERADMIN_EMAIL;
  if (ORIGINAL_ENV.SUPERADMIN_PASSWORD === undefined) delete process.env.SUPERADMIN_PASSWORD;
  await systemPrisma.user.deleteMany({ where: { email: { contains: 'sync-superadmin-test' } } });
});

afterAll(async () => {
  await systemPrisma.$disconnect();
});

test('creates the superadmin from env when none exists', async () => {
  await systemPrisma.user.deleteMany({ where: { role: 'superadmin', agencyId: null, email: { contains: 'sync-superadmin-test' } } });
  process.env.SUPERADMIN_EMAIL = 'sync-superadmin-test-create@platform.test';
  process.env.SUPERADMIN_PASSWORD = 'initial-pw-123';

  await syncSuperadmin(systemPrisma);

  const created = await systemPrisma.user.findFirst({ where: { email: 'sync-superadmin-test-create@platform.test' } });
  expect(created).not.toBeNull();
  expect(created.role).toBe('superadmin');
  expect(created.agencyId).toBeNull();
  expect(await bcrypt.compare('initial-pw-123', created.passwordHash)).toBe(true);
});

test('updates the existing superadmin email and password hash to match env on every run', async () => {
  const original = await systemPrisma.user.create({
    data: {
      email: 'sync-superadmin-test-old@platform.test',
      passwordHash: await bcrypt.hash('old-password', 4),
      name: 'Super Admin',
      role: 'superadmin',
      agencyId: null,
    },
  });

  process.env.SUPERADMIN_EMAIL = 'sync-superadmin-test-new@platform.test';
  process.env.SUPERADMIN_PASSWORD = 'rotated-password-456';

  await syncSuperadmin(systemPrisma);

  const updated = await systemPrisma.user.findUnique({ where: { id: original.id } });
  expect(updated.email).toBe('sync-superadmin-test-new@platform.test');
  expect(await bcrypt.compare('rotated-password-456', updated.passwordHash)).toBe(true);
  expect(await bcrypt.compare('old-password', updated.passwordHash)).toBe(false);

  // findFirst by old email should now be gone
  const byOldEmail = await systemPrisma.user.findFirst({ where: { email: 'sync-superadmin-test-old@platform.test' } });
  expect(byOldEmail).toBeNull();
});

test('leaves the existing superadmin row untouched when env vars are unset (dev fallback)', async () => {
  const original = await systemPrisma.user.create({
    data: {
      email: 'sync-superadmin-test-untouched@platform.test',
      passwordHash: await bcrypt.hash('keep-me', 4),
      name: 'Super Admin',
      role: 'superadmin',
      agencyId: null,
    },
  });
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_PASSWORD;

  await syncSuperadmin(systemPrisma);

  const after = await systemPrisma.user.findUnique({ where: { id: original.id } });
  expect(after.email).toBe('sync-superadmin-test-untouched@platform.test');
  expect(await bcrypt.compare('keep-me', after.passwordHash)).toBe(true);
});

test('picks the oldest superadmin row by id when syncing', async () => {
  const first = await systemPrisma.user.create({
    data: { email: 'sync-superadmin-test-first@platform.test', passwordHash: await bcrypt.hash('a', 4), name: 'First', role: 'superadmin', agencyId: null },
  });
  const second = await systemPrisma.user.create({
    data: { email: 'sync-superadmin-test-second@platform.test', passwordHash: await bcrypt.hash('b', 4), name: 'Second', role: 'superadmin', agencyId: null },
  });

  process.env.SUPERADMIN_EMAIL = 'sync-superadmin-test-synced@platform.test';
  process.env.SUPERADMIN_PASSWORD = 'synced-pw-789';

  await syncSuperadmin(systemPrisma);

  const updatedFirst = await systemPrisma.user.findUnique({ where: { id: first.id } });
  const untouchedSecond = await systemPrisma.user.findUnique({ where: { id: second.id } });
  expect(updatedFirst.email).toBe('sync-superadmin-test-synced@platform.test');
  expect(untouchedSecond.email).toBe('sync-superadmin-test-second@platform.test');
});

test('updates email only when SUPERADMIN_EMAIL is set (password env unset)', async () => {
  const original = await systemPrisma.user.create({
    data: {
      email: 'sync-superadmin-test-partial-old@platform.test',
      passwordHash: await bcrypt.hash('original-password', 4),
      name: 'Super Admin',
      role: 'superadmin',
      agencyId: null,
    },
  });

  delete process.env.SUPERADMIN_PASSWORD;
  process.env.SUPERADMIN_EMAIL = 'sync-superadmin-test-partial-new@platform.test';

  await syncSuperadmin(systemPrisma);

  const updated = await systemPrisma.user.findUnique({ where: { id: original.id } });
  expect(updated.email).toBe('sync-superadmin-test-partial-new@platform.test');
  expect(await bcrypt.compare('original-password', updated.passwordHash)).toBe(true);
});
