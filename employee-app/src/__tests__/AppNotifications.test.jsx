import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NotificationsProvider, useNotifications } from '../hooks/useNotifications';

vi.mock('../api', () => ({
  api: {
    getCertifications: vi.fn().mockResolvedValue({ certifications: [] }),
    getTasks: vi.fn().mockResolvedValue([]),
    getMessageUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

function Probe() {
  const { certsTotal } = useNotifications();
  return <div data-testid="total">{certsTotal}</div>;
}

describe('NotificationsProvider integration', () => {
  it('makes context available inside route tree', async () => {
    render(
      <MemoryRouter>
        <NotificationsProvider>
          <Routes>
            <Route path="/" element={<Probe />} />
          </Routes>
        </NotificationsProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('8'));
  });
});
