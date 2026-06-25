import { describe, it, expect } from 'vitest';
import { CERT_TYPES } from '../certTypes';

describe('CERT_TYPES', () => {
  it('has 8 entries in order', () => {
    expect(CERT_TYPES).toEqual([
      'TB Test',
      'CPR',
      'Annual Training',
      'Cultural Competency',
      'Infection Control',
      'Background Check',
      'ID',
      'Other',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CERT_TYPES)).toBe(true);
  });
});
