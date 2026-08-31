// Audit-log immutability at the DB level.
//
// setup-app-role.js revokes UPDATE/DELETE on public.audit_logs from app_user
// (the role the application request path connects as). This proves it holds:
// as app_user, INSERT + SELECT work, but UPDATE and DELETE are rejected by
// Postgres — so a compromised app connection can only append audit records,
// never rewrite or erase them. The owner connection retains full access (used
// by auditService writes and the retention purge).

const { PrismaClient } = require('@prisma/client');
const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const appConn = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let agency;
let seededId;

beforeAll(async () => {
    agency = await owner.agency.create({ data: { name: 'Audit Immutable', slug: 'audit-immutable' } });
    // Seed a row via the owner so app_user has something to try to mutate.
    const row = await owner.auditLog.create({
        data: {
            userId: 0, userName: 'seed', userRole: 'system',
            action: 'CREATE', entityType: 'ImmutableTest', entityId: 1,
            agencyId: agency.id,
        },
    });
    seededId = row.id;
});

afterAll(async () => {
    await owner.auditLog.deleteMany({ where: { agencyId: agency.id } });
    await owner.agency.deleteMany({ where: { id: agency.id } });
    await owner.$disconnect();
    await appConn.$disconnect();
});

// Helper: run app_user ops inside a tenant context (audit_logs is RLS-scoped on
// agency_id, so we must set app.agency_id or RLS hides the rows).
function withTenant(agencyId, op) {
    return appConn.$transaction([
        appConn.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyId)}, TRUE)`,
        op(),
    ]);
}

test('app_user CAN insert an audit row (append is allowed)', async () => {
    const [, created] = await withTenant(agency.id, () =>
        appConn.auditLog.create({
            data: {
                userId: 0, userName: 'app', userRole: 'system',
                action: 'UPDATE', entityType: 'ImmutableTest', entityId: 2,
                agencyId: agency.id,
            },
        })
    );
    expect(created.id).toBeGreaterThan(0);
});

test('app_user CAN read audit rows (History page)', async () => {
    const [, rows] = await withTenant(agency.id, () =>
        appConn.auditLog.findMany({ where: { entityType: 'ImmutableTest' } })
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
});

test('app_user CANNOT update an audit row (permission denied)', async () => {
    await expect(
        withTenant(agency.id, () =>
            appConn.auditLog.update({ where: { id: seededId }, data: { userName: 'tampered' } })
        )
    ).rejects.toThrow(/permission denied/i);
});

test('app_user CANNOT delete an audit row (permission denied)', async () => {
    await expect(
        withTenant(agency.id, () =>
            appConn.auditLog.delete({ where: { id: seededId } })
        )
    ).rejects.toThrow(/permission denied/i);
});

test('the seeded row is still intact after the blocked update/delete attempts', async () => {
    const row = await owner.auditLog.findUnique({ where: { id: seededId } });
    expect(row).not.toBeNull();
    expect(row.userName).toBe('seed'); // never became "tampered"
});

test('owner connection CAN still delete audit rows (retention purge path)', async () => {
    const tmp = await owner.auditLog.create({
        data: { userId: 0, userName: 'purge-me', userRole: 'system', action: 'CREATE', entityType: 'ImmutableTest', entityId: 9, agencyId: agency.id },
    });
    await owner.auditLog.delete({ where: { id: tmp.id } });
    const gone = await owner.auditLog.findUnique({ where: { id: tmp.id } });
    expect(gone).toBeNull();
});
