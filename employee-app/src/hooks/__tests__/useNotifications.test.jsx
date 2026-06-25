import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { NotificationsProvider, useNotifications } from '../useNotifications';

vi.mock('../../api', () => ({
  api: {
    getCertifications: vi.fn(),
    getTasks: vi.fn(),
    getMessageUnreadCount: vi.fn(),
  },
}));
import { api } from '../../api';

function Probe() {
  const n = useNotifications();
  if (n.loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="approved">{n.certsApproved}</span>
      <span data-testid="actionNeeded">{n.certsActionNeeded}</span>
      <span data-testid="total">{n.certsTotal}</span>
      <span data-testid="tasksOpen">{n.tasksOpen}</span>
      <span data-testid="unread">{n.unreadMessages}</span>
      <span data-testid="state">{n.complianceState}</span>
    </div>
  );
}

const today = new Date();
const inFiveDays = new Date(today.getTime() + 5 * 86400000).toISOString();
const inSixtyDays = new Date(today.getTime() + 60 * 86400000).toISOString();
const yesterday = new Date(today.getTime() - 86400000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNotifications', () => {
  it('derives counts and total=8', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [
      { id: 1, certType: 'TB Test', expirationDate: inSixtyDays, status: 'active' },
      { id: 2, certType: 'CPR', expirationDate: inFiveDays, status: 'active' },
      { id: 3, certType: 'ID', expirationDate: yesterday, status: 'active' },
    ]});
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('8'));
    expect(screen.getByTestId('approved').textContent).toBe('1');
    expect(screen.getByTestId('actionNeeded').textContent).toBe('7'); // 1 expiring + 1 expired + 5 missing
  });

  it('returns overdue when any cert is expired', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [
      { id: 1, certType: 'TB Test', expirationDate: yesterday, status: 'active' },
    ]});
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('overdue'));
  });

  it('returns attention when expiring soon and nothing expired', async () => {
    const certs = [];
    for (const t of ['TB Test','CPR','Annual Training','Cultural Competency','Infection Control','Background Check','ID','Other']) {
      certs.push({ id: certs.length+1, certType: t, expirationDate: inSixtyDays, status: 'active' });
    }
    certs[0].expirationDate = inFiveDays;
    api.getCertifications.mockResolvedValue({ certifications: certs });
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('attention'));
  });

  it('returns compliant when all 8 are valid and no open tasks', async () => {
    const certs = [];
    for (const t of ['TB Test','CPR','Annual Training','Cultural Competency','Infection Control','Background Check','ID','Other']) {
      certs.push({ id: certs.length+1, certType: t, expirationDate: inSixtyDays, status: 'active' });
    }
    api.getCertifications.mockResolvedValue({ certifications: certs });
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('compliant'));
  });

  it('keeps other slices working when one endpoint fails', async () => {
    api.getCertifications.mockRejectedValue(new Error('boom'));
    api.getTasks.mockResolvedValue([{ id: 1, completedAt: null }, { id: 2, completedAt: null }]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 3 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('tasksOpen').textContent).toBe('2'));
    expect(screen.getByTestId('unread').textContent).toBe('3');
  });

  it('counts open tasks (completedAt null)', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [] });
    api.getTasks.mockResolvedValue([
      { id: 1, completedAt: null },
      { id: 2, completedAt: '2026-06-20T00:00:00Z' },
      { id: 3, completedAt: null },
    ]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('tasksOpen').textContent).toBe('2'));
  });

  it('refresh() re-calls the endpoints', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [] });
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    let captured;
    function Capture() { captured = useNotifications(); return null; }
    render(<NotificationsProvider><Capture /></NotificationsProvider>);
    await waitFor(() => expect(api.getCertifications).toHaveBeenCalledTimes(1));

    await act(async () => { await captured.refresh(); });
    expect(api.getCertifications).toHaveBeenCalledTimes(2);
  });
});
