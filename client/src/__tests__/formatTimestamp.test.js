import { describe, it, expect } from 'vitest';
import { formatTimestamp } from '../utils/dates';

describe('formatTimestamp', () => {
  it('formats an ISO datetime as "Mon D, YYYY at h:mm AM/PM"', () => {
    // 2026-08-09T15:04:00 local
    const iso = new Date(2026, 7, 9, 15, 4, 0).toISOString();
    expect(formatTimestamp(iso)).toBe('Aug 9, 2026 at 3:04 PM');
  });

  it('handles midnight and noon', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 0, 0, 0).toISOString())).toBe('Jan 1, 2026 at 12:00 AM');
    expect(formatTimestamp(new Date(2026, 0, 1, 12, 30, 0).toISOString())).toBe('Jan 1, 2026 at 12:30 PM');
  });

  it('returns empty string for null/invalid input', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp('')).toBe('');
    expect(formatTimestamp('not-a-date')).toBe('');
  });
});
