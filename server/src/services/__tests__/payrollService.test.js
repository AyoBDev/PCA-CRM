const { applyAuthCap } = require('../payrollService');

describe('applyAuthCap - weekly grouping', () => {
    test('caps units per week independently', () => {
        const visits = [
            { clientName: 'John Smith', serviceCode: 'PCS', finalPayableUnits: 30, visitDate: new Date('2026-03-15'), voidFlag: false },
            { clientName: 'John Smith', serviceCode: 'PCS', finalPayableUnits: 30, visitDate: new Date('2026-03-22'), voidFlag: false },
        ];
        const clients = [{
            clientName: 'John Smith',
            authorizations: [{ serviceCode: 'PCS', authorizedUnits: 28 }],
        }];

        applyAuthCap(visits, clients);

        // Week 1: 30 > 28, reduced to 28
        expect(visits[0].finalPayableUnits).toBe(28);
        // Week 2: fresh 28 budget, 30 > 28, reduced to 28
        expect(visits[1].finalPayableUnits).toBe(28);
    });

    test('resets balance each week — second week gets full budget', () => {
        const visits = [
            { clientName: 'A', serviceCode: 'PCS', finalPayableUnits: 20, visitDate: new Date('2026-03-15'), voidFlag: false },
            { clientName: 'A', serviceCode: 'PCS', finalPayableUnits: 10, visitDate: new Date('2026-03-16'), voidFlag: false },
            // Next week
            { clientName: 'A', serviceCode: 'PCS', finalPayableUnits: 25, visitDate: new Date('2026-03-22'), voidFlag: false },
        ];
        const clients = [{ clientName: 'A', authorizations: [{ serviceCode: 'PCS', authorizedUnits: 28 }] }];

        applyAuthCap(visits, clients);

        expect(visits[0].finalPayableUnits).toBe(20); // within budget
        expect(visits[1].finalPayableUnits).toBe(8);  // reduced (28-20=8 remaining, 10>8)
        expect(visits[2].finalPayableUnits).toBe(25); // new week, full 28 budget
    });

    test('marks unauthorized when no auth found', () => {
        const visits = [
            { clientName: 'Unknown', serviceCode: 'PCS', finalPayableUnits: 10, visitDate: new Date('2026-03-15'), voidFlag: false },
        ];
        applyAuthCap(visits, []);
        expect(visits[0].isUnauthorized).toBe(true);
    });
});
