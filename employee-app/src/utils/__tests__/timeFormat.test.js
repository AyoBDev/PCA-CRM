import { describe, it, expect } from 'vitest';
import { hhmm12 } from '../timeFormat';

describe('hhmm12', () => {
  it('formats afternoon time', () => {
    expect(hhmm12('14:30')).toBe('2:30 PM');
  });
  it('formats midnight as 12 AM', () => {
    expect(hhmm12('00:00')).toBe('12:00 AM');
  });
  it('formats noon as 12 PM', () => {
    expect(hhmm12('12:00')).toBe('12:00 PM');
  });
  it('returns empty string for empty input', () => {
    expect(hhmm12('')).toBe('');
    expect(hhmm12(null)).toBe('');
  });
});
