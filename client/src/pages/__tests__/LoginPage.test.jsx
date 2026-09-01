import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

vi.mock('../../api', () => ({
  getHostInfo: vi.fn(),
}));

import { getHostInfo } from '../../api';
import LoginPage from '../LoginPage';

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

afterEach(() => {
  vi.clearAllMocks();
});

test('platform host variant renders a login form with no forgot-password link', async () => {
  getHostInfo.mockResolvedValue({ type: 'platform' });
  renderPage();
  await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();
});

test('agency host variant renders the agency name and a forgot-password link', async () => {
  getHostInfo.mockResolvedValue({ type: 'agency', agency: { name: 'Acme Care', slug: 'acme' } });
  renderPage();
  await waitFor(() => expect(screen.getByText('Acme Care')).toBeInTheDocument());
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();
});

test('landing host variant renders no password input', async () => {
  getHostInfo.mockResolvedValue({ type: 'landing' });
  renderPage();
  await waitFor(() => expect(screen.getByText('CareOmni')).toBeInTheDocument());
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});

test('fetch failure falls back gracefully to the agency-style login form', async () => {
  getHostInfo.mockRejectedValue(new Error('network error'));
  renderPage();
  await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});

test('unknown agency subdomain (404) renders the agency-not-found screen', async () => {
  const err = new Error('Not found');
  err.status = 404;
  getHostInfo.mockRejectedValue(err);
  renderPage();
  await waitFor(() => expect(screen.getByText(/no agency exists/i)).toBeInTheDocument());
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});
