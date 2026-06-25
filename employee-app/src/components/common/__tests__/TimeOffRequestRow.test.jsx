import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimeOffRequestRow from '../TimeOffRequestRow';

describe('TimeOffRequestRow', () => {
  it('renders dates, reason, and pending badge', () => {
    const { container } = render(<TimeOffRequestRow request={{ startDate: '2026-07-04', endDate: '2026-07-06', reason: 'Vacation', status: 'pending' }} />);
    expect(screen.getByText(/Vacation/)).toBeInTheDocument();
    expect(container.querySelector('.badge--warning')).toBeTruthy();
  });
  it('maps approved → success', () => {
    const { container } = render(<TimeOffRequestRow request={{ startDate: '2026-07-04', endDate: '2026-07-04', reason: '', status: 'approved' }} />);
    expect(container.querySelector('.badge--success')).toBeTruthy();
  });
  it('maps denied → danger', () => {
    const { container } = render(<TimeOffRequestRow request={{ startDate: '2026-07-04', endDate: '2026-07-04', reason: '', status: 'denied' }} />);
    expect(container.querySelector('.badge--danger')).toBeTruthy();
  });
});
