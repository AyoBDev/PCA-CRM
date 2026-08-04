import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import OnboardingPage from '../OnboardingPage';

vi.mock('../../api', () => ({
  getOnboardingInfo: () => Promise.resolve({ employeeName: 'Sarah', requirements: [{ id: 1, kind: 'document', label: 'Government ID', status: 'required', requiresExpiry: true }], progress: { personal: false, emergency: false, availability: false } }),
  saveOnboardingPersonal: vi.fn(() => Promise.resolve({ success: true })),
  saveOnboardingEmergency: vi.fn(() => Promise.resolve({ success: true })),
  uploadOnboardingDocument: vi.fn(), ackOnboardingPolicy: vi.fn(), submitOnboardingV2: vi.fn(),
}));

it('renders the welcome + Password step first', async () => {
  render(<MemoryRouter initialEntries={['/onboard/tok']}><Routes><Route path="/onboard/:token" element={<OnboardingPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/Welcome, Sarah/i)).toBeInTheDocument());
  expect(screen.getByText(/Set Your Password/i)).toBeInTheDocument();
});
