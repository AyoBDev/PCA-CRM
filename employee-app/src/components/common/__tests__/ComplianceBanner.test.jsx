import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComplianceBanner from '../ComplianceBanner';

vi.mock('../../../hooks/useNotifications', () => ({ useNotifications: vi.fn() }));
import { useNotifications } from '../../../hooks/useNotifications';

function renderWith(state, extra = {}) {
  useNotifications.mockReturnValue({ complianceState: state, certsActionNeeded: 2, ...extra });
  return render(<MemoryRouter><ComplianceBanner /></MemoryRouter>);
}

describe('ComplianceBanner', () => {
  it('renders only when overdue', () => {
    const { container, rerender } = renderWith('compliant');
    expect(container.firstChild).toBeNull();
    rerender(<MemoryRouter><ComplianceBanner /></MemoryRouter>);
  });
  it('renders banner when overdue with link to certs', () => {
    renderWith('overdue');
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/account/certs');
  });
});
