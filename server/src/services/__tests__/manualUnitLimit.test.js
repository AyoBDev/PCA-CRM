const { computeManualUnitLimit, MAX_UNITS } = require('../payrollService');

// The manual payroll edit (updatePayrollVisit) must not let an admin pay more
// units than either (a) the 28/day per-client cap or (b) the client's remaining
// authorization balance for that service+week. computeManualUnitLimit returns
// the max the edited visit may be set to, given its siblings and the client's auths.

const DATE = new Date('2026-06-10T00:00:00.000Z'); // a Wednesday
const clientAuths = [{
    clientName: 'John Client',
    authorizations: [{
        serviceCode: 'PCS',
        authorizedUnits: 20,
        authorizationStartDate: new Date('2026-06-01T00:00:00.000Z'),
        authorizationEndDate: new Date('2026-06-30T00:00:00.000Z'),
        manualStatus: 'active',
    }],
}];

function visit(overrides) {
    return {
        id: 1, clientName: 'John Client', employeeName: 'Jane PCA',
        serviceCode: 'PCS', visitDate: DATE, finalPayableUnits: 0,
        voidFlag: false, needsReview: false, mergedInto: null,
        ...overrides,
    };
}

describe('computeManualUnitLimit', () => {
    it('caps at the daily MAX_UNITS when there are no siblings and ample auth', () => {
        const auths = [{ clientName: 'John Client', authorizations: [{ serviceCode: 'PCS', authorizedUnits: 999, authorizationStartDate: new Date('2026-06-01'), authorizationEndDate: new Date('2026-06-30'), manualStatus: 'active' }] }];
        const limit = computeManualUnitLimit(visit({ id: 1 }), [visit({ id: 1 })], auths);
        expect(limit).toBe(MAX_UNITS); // 28
    });

    it('subtracts sibling same-day units from the daily cap', () => {
        const auths = [{ clientName: 'John Client', authorizations: [{ serviceCode: 'PCS', authorizedUnits: 999, authorizationStartDate: new Date('2026-06-01'), authorizationEndDate: new Date('2026-06-30'), manualStatus: 'active' }] }];
        const edited = visit({ id: 1 });
        const sibling = visit({ id: 2, finalPayableUnits: 10 }); // same client+employee+day
        const limit = computeManualUnitLimit(edited, [edited, sibling], auths);
        expect(limit).toBe(MAX_UNITS - 10); // 18
    });

    it('caps at the remaining authorization balance when that is lower than the daily cap', () => {
        // auth = 20 units for the week, no siblings consuming it -> limit = min(28, 20) = 20
        const edited = visit({ id: 1 });
        const limit = computeManualUnitLimit(edited, [edited], clientAuths);
        expect(limit).toBe(20);
    });

    it('subtracts sibling units from the auth balance too', () => {
        const edited = visit({ id: 1 });
        const sibling = visit({ id: 2, finalPayableUnits: 8, visitDate: new Date('2026-06-11T00:00:00.000Z') }); // same week, consumes auth
        // auth 20 - 8 consumed = 12 remaining; daily cap 28 -> min = 12
        const limit = computeManualUnitLimit(edited, [edited, sibling], clientAuths);
        expect(limit).toBe(12);
    });

    it('returns MAX_UNITS (daily cap only) when the client has no matching authorization', () => {
        // Unauthorized service should not be *blocked* by auth (matches pipeline: keep payable),
        // but is still bounded by the daily cap.
        const edited = visit({ id: 1, serviceCode: 'S5150' });
        const limit = computeManualUnitLimit(edited, [edited], clientAuths);
        expect(limit).toBe(MAX_UNITS);
    });

    it('never returns negative', () => {
        const auths = [{ clientName: 'John Client', authorizations: [{ serviceCode: 'PCS', authorizedUnits: 5, authorizationStartDate: new Date('2026-06-01'), authorizationEndDate: new Date('2026-06-30'), manualStatus: 'active' }] }];
        const edited = visit({ id: 1 });
        const sibling = visit({ id: 2, finalPayableUnits: 10, visitDate: new Date('2026-06-11T00:00:00.000Z') }); // over-consumes
        const limit = computeManualUnitLimit(edited, [edited, sibling], auths);
        expect(limit).toBeGreaterThanOrEqual(0);
    });
});
