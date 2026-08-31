import { describe, test, expect } from 'vitest';
import { getCertStatusForRecords, certStatusLabel, pickRecord } from '../utils/certStatus';

const NOW = new Date('2026-08-31T00:00:00Z');

describe('getCertStatusForRecords', () => {
  test('a pending record with a PAST expiration is Pending Review, not Expired', () => {
    // The employee uploaded a renewal → the record flipped to 'pending'; its old
    // expiration is still in the past. Must not read as expired or unknown.
    const records = [{ certType: 'background_check', status: 'pending', expirationDate: '2020-01-01T00:00:00Z' }];
    const r = getCertStatusForRecords(records, null, NOW);
    expect(r.status).toBe('pending');
    expect(certStatusLabel(r.status)).toBe('Pending Review');
    expect(r.expDate).toBe('2020-01-01T00:00:00Z'); // still surfaced
  });

  test('an active record in the future is ok', () => {
    const records = [{ certType: 'cpr', status: 'active', expirationDate: '2027-06-01T00:00:00Z' }];
    expect(getCertStatusForRecords(records, null, NOW).status).toBe('ok');
  });

  test('an active record within 30 days is critical', () => {
    const records = [{ certType: 'cpr', status: 'active', expirationDate: '2026-09-10T00:00:00Z' }];
    expect(getCertStatusForRecords(records, null, NOW).status).toBe('critical');
  });

  test('an active record in the past is expired', () => {
    const records = [{ certType: 'cpr', status: 'active', expirationDate: '2026-08-11T00:00:00Z' }];
    expect(getCertStatusForRecords(records, null, NOW).status).toBe('expired');
  });

  test('no records and no legacy date is unknown', () => {
    expect(getCertStatusForRecords([], null, NOW).status).toBe('unknown');
  });

  test('active record is preferred over a pending one for the same type', () => {
    const records = [
      { status: 'pending', expirationDate: '2020-01-01T00:00:00Z' },
      { status: 'active', expirationDate: '2027-06-01T00:00:00Z' },
    ];
    const r = getCertStatusForRecords(records, null, NOW);
    expect(r.status).toBe('ok');
    expect(pickRecord(records).pending).toBe(false);
  });
});
