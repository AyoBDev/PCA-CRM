import { describe, it, expect } from 'vitest';
import { isAuthEffectiveOn, currentAuthorizations, currentAuthForCode } from '../utils/authorizations';

const on = (s) => new Date(s + 'T12:00:00Z');

describe('isAuthEffectiveOn', () => {
    it('is true within the date window', () => {
        const a = { serviceCode: 'PCS', authorizationStartDate: '2026-01-01', authorizationEndDate: '2026-12-31' };
        expect(isAuthEffectiveOn(a, on('2026-06-01'))).toBe(true);
    });

    it('is false before the start date (not-yet-effective future renewal)', () => {
        const a = { serviceCode: 'PCS', authorizationStartDate: '2026-09-01', authorizationEndDate: '2027-08-31' };
        expect(isAuthEffectiveOn(a, on('2026-08-18'))).toBe(false);
    });

    it('is false after the end date', () => {
        const a = { serviceCode: 'PCS', authorizationStartDate: '2025-01-01', authorizationEndDate: '2026-08-17' };
        expect(isAuthEffectiveOn(a, on('2026-08-18'))).toBe(false);
    });

    it('includes the boundary days (start === today and end === today)', () => {
        const startToday = { authorizationStartDate: '2026-08-18', authorizationEndDate: '2027-01-01' };
        const endToday = { authorizationStartDate: '2025-01-01', authorizationEndDate: '2026-08-18' };
        expect(isAuthEffectiveOn(startToday, on('2026-08-18'))).toBe(true);
        expect(isAuthEffectiveOn(endToday, on('2026-08-18'))).toBe(true);
    });

    it('treats null bounds as open-ended', () => {
        expect(isAuthEffectiveOn({ authorizationStartDate: null, authorizationEndDate: null }, on('2026-08-18'))).toBe(true);
    });

    it('manual inactive override wins regardless of dates', () => {
        const a = { manualStatus: 'inactive', authorizationStartDate: '2026-01-01', authorizationEndDate: '2026-12-31' };
        expect(isAuthEffectiveOn(a, on('2026-06-01'))).toBe(false);
    });

    it('null/undefined manualStatus counts as active', () => {
        const a = { authorizationStartDate: '2026-01-01', authorizationEndDate: '2026-12-31' };
        expect(isAuthEffectiveOn(a, on('2026-06-01'))).toBe(true);
    });

    it('archived auths are never effective', () => {
        const a = { archivedAt: '2026-05-01', authorizationStartDate: '2026-01-01', authorizationEndDate: '2026-12-31' };
        expect(isAuthEffectiveOn(a, on('2026-06-01'))).toBe(false);
    });
});

describe('current auth during a future renewal gap', () => {
    // The exact reported scenario: current 40-unit PCS auth + a future 48-unit
    // renewal that has not started yet. Only the current one is effective today.
    const auths = [
        { id: 1, serviceCode: 'PCS', authorizedUnits: 40, authorizationStartDate: '2026-06-01', authorizationEndDate: '2026-08-31' },
        { id: 2, serviceCode: 'PCS', authorizedUnits: 48, authorizationStartDate: '2026-09-01', authorizationEndDate: '2027-08-31' },
    ];

    it('returns only the current auth before the renewal start', () => {
        const cur = currentAuthorizations(auths, on('2026-08-18'));
        expect(cur.map(a => a.id)).toEqual([1]);
        expect(currentAuthForCode(auths, 'PCS', on('2026-08-18')).authorizedUnits).toBe(40);
    });

    it('returns only the renewal on/after its start', () => {
        const cur = currentAuthorizations(auths, on('2026-09-01'));
        expect(cur.map(a => a.id)).toEqual([2]);
        expect(currentAuthForCode(auths, 'PCS', on('2026-09-01')).authorizedUnits).toBe(48);
    });
});
