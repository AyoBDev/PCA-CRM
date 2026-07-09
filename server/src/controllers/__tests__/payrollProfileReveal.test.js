// Verifies that revealing an SSN/EIN writes a REVEAL audit entry (HIPAA traceability).

jest.mock('../../lib/prisma', () => ({
    payrollProfile: { findUnique: jest.fn() },
}));
jest.mock('../../services/encryptionService', () => ({
    encrypt: (v) => `enc(${v})`,
    decrypt: (v) => `dec(${v})`,
    maskSSN: (v) => 'XXX-XX-1234',
    maskEIN: (v) => 'XX-XXXXX67',
}));
jest.mock('../../services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../../lib/prisma');
const audit = require('../../services/auditService');
const { revealSensitiveField } = require('../payrollProfileController');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const baseReq = {
    user: { id: 9, name: 'Admin A', role: 'admin' },
    params: { employeeId: '42' },
    query: { field: 'ssn' },
};

beforeEach(() => jest.clearAllMocks());

describe('revealSensitiveField audit logging', () => {
    it('logs a REVEAL action on PayrollProfile when SSN is revealed', async () => {
        prisma.payrollProfile.findUnique.mockResolvedValue({ id: 7, ssn: 'cipher', ein: 'cipher' });
        const res = mockRes();
        await revealSensitiveField(baseReq, res);

        expect(res.json).toHaveBeenCalledWith({ value: 'dec(cipher)' });
        expect(audit.logAction).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 9,
                action: 'REVEAL',
                entityType: 'PayrollProfile',
                entityId: 7,
                metadata: { field: 'ssn' },
            })
        );
    });

    it('rejects an invalid field without logging', async () => {
        const res = mockRes();
        await revealSensitiveField({ ...baseReq, query: { field: 'salary' } }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(audit.logAction).not.toHaveBeenCalled();
    });

    it('does not log when the profile is missing', async () => {
        prisma.payrollProfile.findUnique.mockResolvedValue(null);
        const res = mockRes();
        await revealSensitiveField(baseReq, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(audit.logAction).not.toHaveBeenCalled();
    });
});
