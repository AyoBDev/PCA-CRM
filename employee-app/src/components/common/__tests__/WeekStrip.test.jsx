import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import WeekStrip from '../WeekStrip';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

describe('WeekStrip', () => {
  it('renders 7 day cells', () => {
    const { container } = render(<MemoryRouter><WeekStrip weekStart="2026-06-21" shifts={[]} /></MemoryRouter>);
    expect(container.querySelectorAll('.week-strip__day').length).toBe(7);
  });

  it('marks today (the cell whose date == today)', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    const sundayStr = sunday.toISOString().slice(0, 10);
    const { container } = render(<MemoryRouter><WeekStrip weekStart={sundayStr} shifts={[]} /></MemoryRouter>);
    expect(container.querySelectorAll('.week-strip__day--today').length).toBe(1);
  });

  it('marks days that have shifts as active with hour total', () => {
    const shifts = [
      { shiftDate: '2026-06-22T00:00:00.000Z', startTime: '09:00', endTime: '13:00' },
      { shiftDate: '2026-06-22T00:00:00.000Z', startTime: '14:00', endTime: '16:00' },
      { shiftDate: '2026-06-24T00:00:00.000Z', startTime: '09:00', endTime: '17:00' },
    ];
    const { container, getByText } = render(<MemoryRouter><WeekStrip weekStart="2026-06-21" shifts={shifts} /></MemoryRouter>);
    expect(container.querySelectorAll('.week-strip__day--active').length).toBe(2);
    expect(getByText('6h')).toBeInTheDocument(); // 4+2 on Monday 6/22
    expect(getByText('8h')).toBeInTheDocument(); // Wednesday 6/24
  });

  it('navigates with ?date= on click', () => {
    const nav = vi.fn();
    useNavigate.mockReturnValue(nav);
    const { container } = render(<MemoryRouter><WeekStrip weekStart="2026-06-21" shifts={[]} /></MemoryRouter>);
    fireEvent.click(container.querySelectorAll('.week-strip__day')[2]);
    expect(nav).toHaveBeenCalledWith('/schedule?date=2026-06-23');
  });
});
