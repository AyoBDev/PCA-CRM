import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ComplianceBadge from '../ComplianceBadge';

vi.mock('../../../hooks/useNotifications', () => ({
  useNotifications: vi.fn(),
}));
import { useNotifications } from '../../../hooks/useNotifications';

function withState(state) { useNotifications.mockReturnValue({ complianceState: state }); }

describe('ComplianceBadge', () => {
  it('renders compliant', () => {
    withState('compliant');
    const { container } = render(<ComplianceBadge />);
    expect(container.querySelector('.compliance-badge--compliant')).toBeTruthy();
  });
  it('renders attention', () => {
    withState('attention');
    const { container } = render(<ComplianceBadge />);
    expect(container.querySelector('.compliance-badge--attention')).toBeTruthy();
  });
  it('renders overdue', () => {
    withState('overdue');
    const { container } = render(<ComplianceBadge />);
    expect(container.querySelector('.compliance-badge--overdue')).toBeTruthy();
  });
});
