import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SummaryChip from '../SummaryChip';

describe('SummaryChip', () => {
  it('renders label and value', () => {
    render(<SummaryChip label="shifts" value={5} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/shifts/)).toBeInTheDocument();
  });
  it('renders as link when href is given', () => {
    render(<MemoryRouter><SummaryChip label="messages" value={2} href="/messages" /></MemoryRouter>);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/messages');
  });
  it('applies variant class', () => {
    const { container } = render(<SummaryChip label="x" value="" variant="success" />);
    expect(container.querySelector('.stat-pill--success')).toBeTruthy();
  });
});
