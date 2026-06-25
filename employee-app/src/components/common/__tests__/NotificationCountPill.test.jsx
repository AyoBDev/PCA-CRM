import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NotificationCountPill from '../NotificationCountPill';

describe('NotificationCountPill', () => {
  it('renders null when count is 0', () => {
    const { container } = render(<NotificationCountPill count={0} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders null when count is negative', () => {
    const { container } = render(<NotificationCountPill count={-1} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders the count when positive', () => {
    const { getByText } = render(<NotificationCountPill count={4} />);
    expect(getByText('4')).toBeInTheDocument();
  });
});
