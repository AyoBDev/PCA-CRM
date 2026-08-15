import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as api from '../../../api';
import { ToastProvider } from '../../../hooks/useToast';
import OnboardingReviewModal from '../OnboardingReviewModal';

vi.mock('../../../api');

const detail = {
  employee: { id: 7, name: 'Jane', email: 'j@t.co' },
  requirements: [
    { id: 1, kind: 'document', label: 'ID Card', reviewStatus: 'pending', optional: false, fileName: 'id.pdf' },
    { id: 2, kind: 'policy', label: 'HIPAA', reviewStatus: 'pending', optional: false },
  ],
  availability: null,
};

beforeEach(() => {
  api.getOnboardingReviewDetail.mockResolvedValue(detail);
  api.reviewRequirementItem.mockResolvedValue({ success: true });
  api.finalizeOnboarding.mockResolvedValue({ success: true, outcome: 'approved' });
});

function renderModal() {
  return render(<ToastProvider><OnboardingReviewModal employeeId={7} onClose={() => {}} onResolved={() => {}} /></ToastProvider>);
}

describe('OnboardingReviewModal', () => {
  it('disables Finish Review until every required item is decided', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    const finish = screen.getByRole('button', { name: /finish review/i });
    expect(finish).toBeDisabled();
  });

  it('Approve all remaining decides every pending item then enables Finish', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /approve all remaining/i }));
    await waitFor(() => expect(api.reviewRequirementItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /finish review/i })).not.toBeDisabled());
  });

  it('approving a single row calls reviewRequirementItem with approved decision', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    const rows = screen.getAllByRole('button', { name: /^approve$/i });
    fireEvent.click(rows[0]);
    await waitFor(() => expect(api.reviewRequirementItem).toHaveBeenCalledWith(7, 1, 'approved'));
  });

  it('rejecting a row requires a reason before confirming', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    const rejectButtons = screen.getAllByRole('button', { name: /^reject$/i });
    fireEvent.click(rejectButtons[0]);
    const confirmButtons = screen.getAllByRole('button', { name: /confirm reject/i });
    expect(confirmButtons[0]).toBeDisabled();
    const textarea = screen.getAllByPlaceholderText(/reason/i)[0];
    fireEvent.change(textarea, { target: { value: 'Blurry photo' } });
    expect(confirmButtons[0]).not.toBeDisabled();
    fireEvent.click(confirmButtons[0]);
    await waitFor(() => expect(api.reviewRequirementItem).toHaveBeenCalledWith(7, 1, 'rejected', 'Blurry photo'));
  });

  it('Finish Review calls finalizeOnboarding and resolves on success', async () => {
    const onResolved = vi.fn();
    const onClose = vi.fn();
    render(<ToastProvider><OnboardingReviewModal employeeId={7} onClose={onClose} onResolved={onResolved} /></ToastProvider>);
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /approve all remaining/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /finish review/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /finish review/i }));
    await waitFor(() => expect(api.finalizeOnboarding).toHaveBeenCalledWith(7));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(7));
    expect(onClose).toHaveBeenCalled();
  });
});
