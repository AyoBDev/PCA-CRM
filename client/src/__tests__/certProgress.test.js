// client/src/__tests__/certProgress.test.js
import { describe, it, expect } from 'vitest';
import { progressForCert } from '../utils/certProgress';

describe('progressForCert', () => {
  it('active dated cert → proportional pct, active variant', () => {
    const r = progressForCert({ status: 'ok', days: 182, renewalYears: 1, hasFile: true });
    expect(r.variant).toBe('active');
    expect(r.pct).toBeGreaterThan(40); expect(r.pct).toBeLessThan(60);
  });
  it('expiring cert → expiring variant', () => {
    expect(progressForCert({ status: 'critical', days: 20, renewalYears: 1, hasFile: true }).variant).toBe('expiring');
  });
  it('expired cert → 0 pct, expired variant', () => {
    expect(progressForCert({ status: 'expired', days: -5, renewalYears: 1, hasFile: true })).toEqual({ pct: 0, variant: 'expired' });
  });
  it('not-set cert (no expiry) → notset variant, short bar', () => {
    const r = progressForCert({ status: 'unset', days: null, renewalYears: 2, hasFile: false });
    expect(r.variant).toBe('notset'); expect(r.pct).toBeGreaterThan(0); expect(r.pct).toBeLessThan(30);
  });
  it('completed one-time (no expiry, has file) → complete, full bar', () => {
    expect(progressForCert({ status: 'ok', days: null, renewalYears: null, hasFile: true })).toEqual({ pct: 100, variant: 'complete' });
  });
  it('clamps pct to 0..100', () => {
    expect(progressForCert({ status: 'ok', days: 99999, renewalYears: 1, hasFile: true }).pct).toBe(100);
  });
});
