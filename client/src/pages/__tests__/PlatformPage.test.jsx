import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn(), showUndoToast: vi.fn(), clearToast: vi.fn() }),
}));

vi.mock('../../api', () => ({
  listPlatformAgencies: vi.fn().mockResolvedValue([
    { id: 1, name: 'NV Best PCA', slug: 'nvbest', status: 'active', userCount: 4, clientCount: 12, createdAt: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'Acme Care', slug: 'acme', status: 'suspended', userCount: 1, clientCount: 0, createdAt: '2026-06-01T00:00:00Z' },
  ]),
  createPlatformAgency: vi.fn().mockResolvedValue({ agency: { id: 3 } }),
  suspendAgency: vi.fn(),
  reactivateAgency: vi.fn(),
  impersonateAgency: vi.fn().mockResolvedValue({ token: 't', subdomainUrl: 'http://acme.localhost' }),
  resetDemoAgency: vi.fn().mockResolvedValue({
    agency: { id: 9, name: 'Silver Sage Home Care (Demo)', slug: 'demo' },
    url: 'http://demo.localhost',
    adminEmail: 'admin@demo.local',
    adminPassword: 'Demo-abc123',
    caregiverPassword: 'DemoPass1234!',
    counts: { clients: 8, employees: 5, shifts: 40 },
    reset: false,
  }),
}));

import * as api from '../../api';
import PlatformPage from '../PlatformPage';

function renderPage() {
  return render(<MemoryRouter><PlatformPage /></MemoryRouter>);
}

test('lists agencies with status and counts', async () => {
  renderPage();
  expect(await screen.findByText('NV Best PCA')).toBeInTheDocument();
  expect(screen.getByText('Acme Care')).toBeInTheDocument();
  expect(screen.getByText(/suspended/i)).toBeInTheDocument();
});

test('create agency form submits name, slug and admin details', async () => {
  renderPage();
  await screen.findByText('NV Best PCA');
  fireEvent.click(screen.getByRole('button', { name: /new agency/i }));
  fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: 'Beta Care' } });
  fireEvent.change(screen.getByLabelText(/subdomain/i), { target: { value: 'beta' } });
  fireEvent.change(screen.getByLabelText(/admin email/i), { target: { value: 'a@beta.test' } });
  fireEvent.change(screen.getByLabelText(/admin name/i), { target: { value: 'Beta Admin' } });
  fireEvent.click(screen.getByRole('button', { name: /create agency/i }));
  await waitFor(() =>
    expect(api.createPlatformAgency).toHaveBeenCalledWith({
      name: 'Beta Care', slug: 'beta', adminEmail: 'a@beta.test', adminName: 'Beta Admin',
    })
  );
});


// ── Demo agency ─────────────────────────────────────────────────────────────

test('demo agency button does not provision until the wipe is confirmed', async () => {
  renderPage();
  await screen.findByText('NV Best PCA');
  fireEvent.click(screen.getByRole('button', { name: /demo agency/i }));
  // Confirmation is up, but nothing has been destroyed yet.
  expect(api.resetDemoAgency).not.toHaveBeenCalled();
  expect(screen.getByText(/erase/i)).toBeInTheDocument();
});

test('confirming the demo reset provisions and shows the sign-in details', async () => {
  renderPage();
  await screen.findByText('NV Best PCA');
  fireEvent.click(screen.getByRole('button', { name: /demo agency/i }));
  fireEvent.click(screen.getByRole('button', { name: /build demo/i }));
  await waitFor(() => expect(api.resetDemoAgency).toHaveBeenCalledTimes(1));
  // The one-time password is surfaced so the demoer can actually sign in.
  expect(await screen.findByText('admin@demo.local')).toBeInTheDocument();
  expect(screen.getByText('Demo-abc123')).toBeInTheDocument();
});

test('demo reset takes no arguments, so the target cannot be redirected', async () => {
  renderPage();
  await screen.findByText('NV Best PCA');
  fireEvent.click(screen.getByRole('button', { name: /demo agency/i }));
  fireEvent.click(screen.getByRole('button', { name: /build demo/i }));
  await waitFor(() => expect(api.resetDemoAgency).toHaveBeenCalledWith());
});
