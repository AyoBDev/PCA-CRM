import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { EmployeeAttentionProvider, useEmployeeAttention } from '../hooks/useEmployeeAttention';

vi.mock('../api', () => ({
  getEmployeeAttention: vi.fn(),
  markAttentionSeen: vi.fn(),
}));
import * as api from '../api';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 1, role: 'admin' } })),
}));
import * as useAuthModule from '../hooks/useAuth';

function Probe() {
  const n = useEmployeeAttention();
  if (n.loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="total">{n.totalCount}</span>
      <span data-testid="certs">{n.counts.certsPendingReview}</span>
      <span data-testid="events-len">{n.recentEvents.length}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthModule.useAuth.mockReturnValue({ user: { id: 1, role: 'admin' } });
});

describe('useEmployeeAttention', () => {
  it('exposes counts and totalCount from the API', async () => {
    api.getEmployeeAttention.mockResolvedValue({
      counts: { certsPendingReview: 3, timeOffPending: 1, availabilityPending: 0, profileChangesUnseen: 2 },
      recentEvents: [{ eventKey: 'cert-pending:1', type: 'cert-pending' }],
    });
    render(<EmployeeAttentionProvider><Probe /></EmployeeAttentionProvider>);

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('6'));
    expect(screen.getByTestId('certs').textContent).toBe('3');
    expect(screen.getByTestId('events-len').textContent).toBe('1');
  });

  it('handles fetch failure with zeroed counts and empty events', async () => {
    api.getEmployeeAttention.mockRejectedValue(new Error('boom'));
    render(<EmployeeAttentionProvider><Probe /></EmployeeAttentionProvider>);

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('0'));
    expect(screen.getByTestId('events-len').textContent).toBe('0');
  });

  it('markSeen calls the API and triggers a refresh', async () => {
    api.getEmployeeAttention.mockResolvedValue({
      counts: { certsPendingReview: 1, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 },
      recentEvents: [],
    });
    api.markAttentionSeen.mockResolvedValue({ success: true, count: 1 });

    let captured;
    function Capture() { captured = useEmployeeAttention(); return null; }
    render(<EmployeeAttentionProvider><Capture /></EmployeeAttentionProvider>);

    await waitFor(() => expect(api.getEmployeeAttention).toHaveBeenCalledTimes(1));

    await act(async () => { await captured.markSeen('cert-pending:42'); });

    expect(api.markAttentionSeen).toHaveBeenCalledWith('cert-pending:42');
    expect(api.getEmployeeAttention).toHaveBeenCalledTimes(2);
  });

  it('does not call the API when user is null', async () => {
    useAuthModule.useAuth.mockReturnValue({ user: null });
    api.getEmployeeAttention.mockResolvedValue({
      counts: { certsPendingReview: 0, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 },
      recentEvents: [],
    });
    render(<EmployeeAttentionProvider><Probe /></EmployeeAttentionProvider>);

    // Give it time to attempt any async calls
    await new Promise(r => setTimeout(r, 100));
    expect(api.getEmployeeAttention).not.toHaveBeenCalled();
  });

  it('throws when used outside the provider', () => {
    function Bad() { useEmployeeAttention(); return null; }
    expect(() => render(<Bad />)).toThrow();
  });
});
