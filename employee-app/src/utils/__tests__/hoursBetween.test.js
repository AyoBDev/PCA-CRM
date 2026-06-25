import { describe, it, expect } from 'vitest';
import { hoursBetween } from '../hoursBetween';

describe('hoursBetween', () => {
  it('computes simple AM-PM range', () => {
    expect(hoursBetween('09:00', '13:00')).toBe(4);
  });
  it('handles 15-minute increments', () => {
    expect(hoursBetween('09:15', '13:00')).toBe(3.75);
  });
  it('handles overnight (end < start)', () => {
    expect(hoursBetween('22:00', '02:00')).toBe(4);
  });
  it('returns 0 when inputs are missing', () => {
    expect(hoursBetween('', '13:00')).toBe(0);
    expect(hoursBetween(null, '13:00')).toBe(0);
  });
});
