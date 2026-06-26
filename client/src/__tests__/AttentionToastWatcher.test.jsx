import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AttentionToastWatcher from '../components/AttentionToastWatcher';

const showToast = vi.fn();
const markSeen = vi.fn().mockResolvedValue();

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('../hooks/useEmployeeAttention', () => ({
  useEmployeeAttention: vi.fn(),
}));
import { useEmployeeAttention } from '../hooks/useEmployeeAttention';

describe('AttentionToastWatcher', () => {
  it('renders nothing visible', () => {
    useEmployeeAttention.mockReturnValue({ recentEvents: [], markSeen });
    const { container } = render(<AttentionToastWatcher />);
    expect(container.firstChild).toBeNull();
  });

  it('dispatches a toast for each new recent event on mount', async () => {
    useEmployeeAttention.mockReturnValue({
      recentEvents: [
        { eventKey: 'cert-pending:1', type: 'cert-pending', employeeName: 'Jane', subject: 'CPR' },
        { eventKey: 'time-off-pending:5', type: 'time-off-pending', employeeName: 'Bob', subject: 'vacation' },
      ],
      markSeen,
    });
    render(<AttentionToastWatcher />);
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(2));
    expect(showToast.mock.calls[0][0]).toMatch(/Jane/);
    expect(showToast.mock.calls[1][0]).toMatch(/Bob/);
  });

  it('does not re-toast events already shown in this session', async () => {
    showToast.mockClear();
    useEmployeeAttention.mockReturnValue({
      recentEvents: [{ eventKey: 'cert-pending:1', type: 'cert-pending', employeeName: 'Jane', subject: 'CPR' }],
      markSeen,
    });
    const { rerender } = render(<AttentionToastWatcher />);
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));

    // Re-render with the same event — should NOT toast again.
    rerender(<AttentionToastWatcher />);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('calls markSeen with the eventKeys after dispatching toasts', async () => {
    markSeen.mockClear();
    useEmployeeAttention.mockReturnValue({
      recentEvents: [
        { eventKey: 'cert-pending:99', type: 'cert-pending', employeeName: 'Jane', subject: 'CPR' },
      ],
      markSeen,
    });
    render(<AttentionToastWatcher />);
    await waitFor(() => expect(markSeen).toHaveBeenCalled());
    expect(markSeen.mock.calls[0][0]).toEqual(['cert-pending:99']);
  });
});
