import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScheduleWeekHeader from '../ScheduleWeekHeader';

describe('ScheduleWeekHeader', () => {
  it('shows empty-week message when no shifts', () => {
    render(<ScheduleWeekHeader shifts={[]} />);
    expect(screen.getByText(/no shifts this week/i)).toBeInTheDocument();
  });

  it('totals hours and shift count', () => {
    const shifts = [
      { startTime: '09:00', endTime: '13:00', client: { clientName: 'Jane Doe' } },
      { startTime: '14:00', endTime: '17:00', client: { clientName: 'Jane Doe' } },
      { startTime: '09:00', endTime: '11:00', client: { clientName: 'Bob' } },
    ];
    render(<ScheduleWeekHeader shifts={shifts} />);
    expect(screen.getByText(/9 hrs/i)).toBeInTheDocument();
    expect(screen.getByText(/3 shifts/i)).toBeInTheDocument();
  });

  it('sorts breakdown by hours desc', () => {
    const shifts = [
      { startTime: '09:00', endTime: '11:00', client: { clientName: 'Alice' } },
      { startTime: '09:00', endTime: '17:00', client: { clientName: 'Bob' } },
    ];
    const { container } = render(<ScheduleWeekHeader shifts={shifts} />);
    const rows = container.querySelectorAll('.schedule-week-header__row');
    expect(rows[0].textContent).toMatch(/Bob/);
    expect(rows[1].textContent).toMatch(/Alice/);
  });

  it('handles overnight shift', () => {
    const shifts = [{ startTime: '22:00', endTime: '02:00', client: { clientName: 'X' } }];
    const { container } = render(<ScheduleWeekHeader shifts={shifts} />);
    expect(container.textContent).toMatch(/4 hrs/);
  });
});
