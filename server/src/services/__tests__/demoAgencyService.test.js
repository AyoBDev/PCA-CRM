// Unit tests for demo-agency provisioning. prisma is mocked — the point of
// these tests is the CONTROL FLOW, above all the destructive path's scoping:
// the reset must be incapable of deleting anything but the demo agency.

jest.mock('../../lib/prisma', () => {
    const model = () => ({
        findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(), createMany: jest.fn(), update: jest.fn(), upsert: jest.fn(),
        delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn().mockResolvedValue(0),
    });
    return {
        agency: model(), user: model(), client: model(), employee: model(),
        authorization: model(), shift: model(), timesheet: model(), timesheetEntry: model(),
        permanentLink: model(), employeeCertification: model(), certificationUpload: model(),
        payrollRun: model(), payrollVisit: model(), auditLog: model(),
        insuranceType: model(), service: model(), workflowTrigger: model(),
        adminFolder: model(), adminFile: model(), employeeScheduleLink: model(),
        $transaction: jest.fn(),
    };
});
jest.mock('../../../prisma/seedAgencyDefaults', () => ({ seedAgencyDefaults: jest.fn() }));
jest.mock('../auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../lib/tenantContext', () => ({
    runWithTenant: (_ctx, fn) => fn(),
    getAgencyId: () => null,
    getImpersonatorId: () => null,
}));

const prisma = require('../../lib/prisma');
const { DEMO_SLUG } = require('../../lib/demoData');

describe('demoAgencyService', () => {
    let service;
    beforeEach(() => {
        jest.clearAllMocks();
        service = require('../demoAgencyService');
    });

    describe('destroyDemoAgency — the destructive path', () => {
        it('looks the agency up by the hard-coded demo slug, never a caller-supplied one', async () => {
            prisma.agency.findUnique.mockResolvedValue(null);
            await service.destroyDemoAgency();
            expect(prisma.agency.findUnique).toHaveBeenCalledWith({ where: { slug: DEMO_SLUG } });
        });

        it('is a no-op when no demo agency exists', async () => {
            prisma.agency.findUnique.mockResolvedValue(null);
            const res = await service.destroyDemoAgency();
            expect(prisma.agency.delete).not.toHaveBeenCalled();
            expect(res.deleted).toBe(false);
        });

        it('deletes ONLY the agency row whose slug is "demo", by id', async () => {
            prisma.agency.findUnique.mockResolvedValue({ id: 42, slug: DEMO_SLUG, name: 'x' });
            prisma.agency.delete.mockResolvedValue({ id: 42 });
            const res = await service.destroyDemoAgency();
            expect(prisma.agency.delete).toHaveBeenCalledTimes(1);
            expect(prisma.agency.delete).toHaveBeenCalledWith({ where: { id: 42 } });
            expect(res.deleted).toBe(true);
        });

        it('REFUSES to delete when the looked-up row is not the demo slug', async () => {
            // Defence in depth: even if the lookup somehow returned a foreign
            // agency, the service must not delete it.
            prisma.agency.findUnique.mockResolvedValue({ id: 7, slug: 'realagency', name: 'Real' });
            await expect(service.destroyDemoAgency()).rejects.toThrow(/refus/i);
            expect(prisma.agency.delete).not.toHaveBeenCalled();
        });

        it('never issues an unscoped deleteMany against a tenant table', async () => {
            prisma.agency.findUnique.mockResolvedValue({ id: 42, slug: DEMO_SLUG, name: 'x' });
            prisma.agency.delete.mockResolvedValue({ id: 42 });
            await service.destroyDemoAgency();
            // Cascade from the agency row does the work; no manual table sweeps.
            for (const t of ['client', 'employee', 'shift', 'timesheet', 'payrollRun', 'user']) {
                expect(prisma[t].deleteMany).not.toHaveBeenCalled();
            }
        });
    });

    describe('provisionDemoAgency', () => {
        it('exports a provision entry point', () => {
            expect(typeof service.provisionDemoAgency).toBe('function');
        });
    });
});
