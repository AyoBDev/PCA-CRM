import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as api from '../../api';
import OnboardingPage from '../OnboardingPage';

vi.mock('../../api');

const ledger = [
  { id: 1, kind: 'document', status: 'approved', reviewStatus: 'approved', optional: false, label: 'ID Card', rejectionReason: '' },
  { id: 2, kind: 'document', status: 'submitted', reviewStatus: 'rejected', optional: false, label: 'SSN Card', rejectionReason: 'Illegible scan' },
];

beforeEach(() => {
  api.getOnboardingInfo.mockResolvedValue({
    employeeName: 'Jane', employeeEmail: 'j@t.co', adminReviewNote: '',
    onboardingStatus: 'changes_requested', requirements: ledger,
    saved: { personal: {}, emergency: {}, availability: null },
    progress: { personal: true, emergency: true, availability: true },
  });
});

it('shows a changes-requested banner listing rejected items with reasons', async () => {
  render(<MemoryRouter initialEntries={['/onboard/tok']}><Routes><Route path="/onboard/:token" element={<OnboardingPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/changes requested/i)).toBeInTheDocument());
  expect(screen.getAllByText(/SSN Card/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Illegible scan/).length).toBeGreaterThan(0);
});
