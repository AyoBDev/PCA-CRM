import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the api module so any data-fetching pages/hooks that mount (HomePage,
// NotificationsProvider, MessagingProvider) don't make real/unhandled fetch calls.
vi.mock('../api', () => ({
  api: {
    getNextShift: vi.fn().mockResolvedValue(null),
    getActivity: vi.fn().mockResolvedValue([]),
    getWeekSchedule: vi.fn().mockResolvedValue({ shifts: [] }),
    getMyOffers: vi.fn().mockResolvedValue([]),
    getCertifications: vi.fn().mockResolvedValue({ certifications: [] }),
    getTasks: vi.fn().mockResolvedValue([]),
    getMessageUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
    login: vi.fn(),
    getMe: vi.fn(),
    getMyOnboardingLink: vi.fn().mockResolvedValue({ token: 'tok-123' }),
  },
}));

// Mock useAuth to control the authenticated user's onboardingStatus directly.
// The consumer hook (useAuth) is what App.jsx's ProtectedRoutes and
// OnboardingStatusPage call, so overriding it here drives the gate for real —
// AuthProvider is passed through untouched (children render normally) so any
// nested provider composition in App.jsx still works.
vi.mock('../hooks/useAuth', async () => {
  const actual = await vi.importActual('../hooks/useAuth');
  return {
    ...actual,
    AuthProvider: ({ children }) => children,
    useAuth: () => mockAuth,
  };
});
let mockAuth = {};

import App from '../App';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('status gating', () => {
  beforeEach(() => {
    mockAuth = {};
  });

  it('active employee can see the home shell', async () => {
    mockAuth = { user: { id: 1, onboardingStatus: 'active' }, loading: false };
    renderAt('/');
    // Stable marker rendered by EmployeeLayout (the app shell wrapping all
    // protected pages) — proves the shell mounted, not the onboarding screen.
    expect(await screen.findByText('CareOmni')).toBeInTheDocument();
    expect(screen.queryByText(/changes requested|onboarding submitted|complete your setup/i)).not.toBeInTheDocument();
  });

  it('changes_requested employee is redirected off the home shell', async () => {
    mockAuth = { user: { id: 1, onboardingStatus: 'changes_requested' }, loading: false };
    renderAt('/');
    // The onboarding-status screen renders instead of the schedule/home shell.
    expect(await screen.findByText(/changes requested/i)).toBeInTheDocument();
    expect(screen.queryByText('CareOmni')).not.toBeInTheDocument();
  });
});
