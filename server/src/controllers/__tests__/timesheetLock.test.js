// Submitted/accepted timesheets are Medicaid records: their content must be
// immutable once signed & submitted — including for admins. Corrections go
// through reject→draft (PUT /status), not a silent content overwrite.

jest.mock('../../lib/prisma', () => ({
    timesheet: { findUnique: jest.fn(), update: jest.fn() },
    timesheetEntry: { update: jest.fn() },
}));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn(), diffFields: () => [] }));

const prisma = require('../../lib/prisma');
const { updateTimesheet } = require('../timesheetController');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

beforeEach(() => jest.clearAllMocks());

const adminReq = (status) => ({
    params: { id: '5' },
    user: { id: 1, name: 'Admin', role: 'admin', agencyId: 1 },
    db: prisma,
    body: { entries: [], recipientName: 'X' },
    __status: status,
});

describe('updateTimesheet lock on submitted/accepted', () => {
    it('BLOCKS an admin from editing a submitted timesheet', async () => {
        prisma.timesheet.findUnique.mockResolvedValue({ id: 5, status: 'submitted' });
        const res = mockRes();
        await updateTimesheet(adminReq('submitted'), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.timesheet.update).not.toHaveBeenCalled();
    });

    it('BLOCKS an admin from editing an accepted timesheet', async () => {
        prisma.timesheet.findUnique.mockResolvedValue({ id: 5, status: 'accepted' });
        const res = mockRes();
        await updateTimesheet(adminReq('accepted'), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.timesheet.update).not.toHaveBeenCalled();
    });

    it('ALLOWS editing a draft timesheet', async () => {
        prisma.timesheet.findUnique.mockResolvedValue({ id: 5, status: 'draft' });
        prisma.timesheet.update.mockResolvedValue({ id: 5, status: 'draft', entries: [], client: null });
        const res = mockRes();
        await updateTimesheet(adminReq('draft'), res);
        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(prisma.timesheet.update).toHaveBeenCalled();
    });
});
