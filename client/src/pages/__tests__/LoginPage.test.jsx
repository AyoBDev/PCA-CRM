import { render, screen, waitFor, act } from '@testing-library/react';
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
  // Wait on something ONLY the landing page renders. The heading "CareOmni" is
  // shared with the login card that renders while the host check is still in
  // flight, so waiting on it passes before the landing state is applied and the
  // password assertion below then races the pending promise.
  await waitFor(() => expect(screen.getByText(/contact us/i)).toBeInTheDocument());
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});

test('fetch failure falls back gracefully to the agency-style login form', async () => {
  getHostInfo.mockRejectedValue(new Error('network error'));
  renderPage();
  // The fallback state is visually identical to the pre-resolution default, so
  // there is no DOM signal that proves the error path ran. Gate on the call
  // having settled first — otherwise this test passes without the rejection
  // ever being handled, and asserts nothing about the failure behaviour.
  await waitFor(() => expect(getHostInfo).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  // Neither of the states the error path could have wrongly landed in.
  expect(screen.queryByText(/no agency exists/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/contact us/i)).not.toBeInTheDocument();
});

test('unknown agency subdomain (404) renders the agency-not-found screen', async () => {
  const err = new Error('Not found');
  err.status = 404;
  getHostInfo.mockRejectedValue(err);
  renderPage();
  await waitFor(() => expect(screen.getByText(/no agency exists/i)).toBeInTheDocument());
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});
