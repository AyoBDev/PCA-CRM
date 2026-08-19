import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import OnboardingStatusPage from '../OnboardingStatusPage';

// Control the auth context: refreshMe is what the page polls on mount so a
// gated employee picks up an admin's approve→active without re-logging in.
let mockAuth = {};
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => mockAuth }));

describe('OnboardingStatusPage', () => {
  beforeEach(() => { mockAuth = {}; });

  it('calls refreshMe on mount so status polls to current', async () => {
    const refreshMe = vi.fn().mockResolvedValue({ onboardingStatus: 'pending_review' });
    mockAuth = { user: { id: 1, onboardingStatus: 'pending_review' }, refreshMe };
    render(<MemoryRouter><OnboardingStatusPage /></MemoryRouter>);
    await waitFor(() => expect(refreshMe).toHaveBeenCalled());
    expect(screen.getByText(/onboarding submitted/i)).toBeInTheDocument();
  });

  it('renders the changes-requested copy for a changes_requested employee', async () => {
    const refreshMe = vi.fn().mockResolvedValue({ onboardingStatus: 'changes_requested' });
    mockAuth = { user: { id: 1, onboardingStatus: 'changes_requested' }, refreshMe };
    render(<MemoryRouter><OnboardingStatusPage /></MemoryRouter>);
    await waitFor(() => expect(refreshMe).toHaveBeenCalled());
    expect(screen.getByText(/changes requested/i)).toBeInTheDocument();
  });
});
