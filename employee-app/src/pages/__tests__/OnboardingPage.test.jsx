import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach } from 'vitest';
import OnboardingPage from '../OnboardingPage';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getOnboardingInfo: vi.fn(),
  saveOnboardingPersonal: vi.fn(() => Promise.resolve({ success: true })),
  saveOnboardingEmergency: vi.fn(() => Promise.resolve({ success: true })),
  saveOnboardingAvailabilityDraft: vi.fn(() => Promise.resolve({ success: true })),
  uploadOnboardingDocument: vi.fn(), ackOnboardingPolicy: vi.fn(), submitOnboardingV2: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/onboard/tok']}>
      <Routes><Route path="/onboard/:token" element={<OnboardingPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

it('a fresh employee starts on the welcome + Password step', async () => {
  api.getOnboardingInfo.mockResolvedValue({
    employeeName: 'Sarah',
    requirements: [{ id: 1, kind: 'document', label: 'Government ID', status: 'required', requiresExpiry: true }],
    saved: { personal: {}, emergency: {}, availability: null },
    progress: { personal: false, emergency: false, availability: false },
  });
  renderPage();
  await waitFor(() => expect(screen.getByText(/Welcome, Sarah/i)).toBeInTheDocument());
  expect(screen.getByText(/Set Your Password/i)).toBeInTheDocument();
});

it('a returning employee resumes at the first unsaved step (skips password)', async () => {
  // Personal + emergency + availability already saved; one document still required.
  api.getOnboardingInfo.mockResolvedValue({
    employeeName: 'Sarah',
    requirements: [{ id: 1, kind: 'document', label: 'Government ID', status: 'required', requiresExpiry: true }],
    saved: {
      personal: { address: '1 St', dob: '1990-01-01' },
      emergency: { emergencyContactName: 'Jane' },
      availability: { availableFrom: '2026-09-01', maxHoursPerWeek: 40 },
    },
    progress: { personal: true, emergency: true, availability: true },
  });
  renderPage();
  // Should land on Documents (the first unsaved step), not Password.
  await waitFor(() => expect(screen.getByText(/Upload a photo or PDF/i)).toBeInTheDocument());
  expect(screen.queryByText(/Set Your Password/i)).not.toBeInTheDocument();
});
