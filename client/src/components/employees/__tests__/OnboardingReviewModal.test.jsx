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
  vi.clearAllMocks(); // reset call history so per-test call-count assertions are isolated
  api.getOnboardingReviewDetail.mockResolvedValue(detail);
  api.reviewRequirementItem.mockResolvedValue({ success: true });
  api.approveOnboardingSubmission.mockResolvedValue({ success: true, outcome: 'approved' });
  api.sendBackOnboarding.mockResolvedValue({ success: true, outcome: 'changes_requested' });
  api.rejectOnboardingSubmission.mockResolvedValue({ success: true, outcome: 'inactive' });
});

function renderModal(props = {}) {
  return render(
    <ToastProvider>
      <OnboardingReviewModal employeeId={7} onClose={() => {}} onResolved={() => {}} {...props} />
    </ToastProvider>
  );
}

describe('OnboardingReviewModal', () => {
  it('shows all three whole-submission actions once loaded', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /approve & activate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send back for correction/i })).toBeInTheDocument();
    // Whole-submission reject is "Reject Application" — distinct from the per-item "Reject".
    expect(screen.getByRole('button', { name: /reject application/i })).toBeInTheDocument();
  });

  it('Approve & Activate calls approveOnboardingSubmission and resolves', async () => {
    const onResolved = vi.fn();
    const onClose = vi.fn();
    renderModal({ onResolved, onClose });
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /approve & activate/i }));
    await waitFor(() => expect(api.approveOnboardingSubmission).toHaveBeenCalledWith(7));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(7));
    expect(onClose).toHaveBeenCalled();
  });

  it('Send Back requires a note before confirming, then calls sendBackOnboarding', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /send back for correction/i }));
    // Now in note mode: the confirm button is disabled until a note is typed.
    const confirm = screen.getByRole('button', { name: /^send back for correction$/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/describe what to fix/i), { target: { value: 'Re-upload your ID' } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(api.sendBackOnboarding).toHaveBeenCalledWith(7, 'Re-upload your ID'));
  });

  it('Reject requires a note before confirming, then calls rejectOnboardingSubmission', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /reject application/i }));
    const confirm = screen.getByRole('button', { name: /confirm reject/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/why is this application being rejected/i), { target: { value: 'Incomplete docs' } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(api.rejectOnboardingSubmission).toHaveBeenCalledWith(7, 'Incomplete docs'));
  });

  it('approving a single requirement row calls reviewRequirementItem', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    const rowApprove = screen.getAllByRole('button', { name: /^approve$/i });
    fireEvent.click(rowApprove[0]);
    // decide() passes (employeeId, reqId, decision, reason) — reason is undefined for approve.
    await waitFor(() => expect(api.reviewRequirementItem).toHaveBeenCalledWith(7, 1, 'approved', undefined));
  });

  it('Approve all remaining approves every pending required item', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('ID Card')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /approve all remaining/i }));
    await waitFor(() => expect(api.reviewRequirementItem).toHaveBeenCalledTimes(2));
  });

  it('legacy employee with no requirements still shows the three actions', async () => {
    api.getOnboardingReviewDetail.mockResolvedValue({
      employee: { id: 9, name: 'Legacy Lee', email: 'l@t.co' },
      requirements: [],
      availability: null,
    });
    renderModal({ employeeId: 9 });
    await waitFor(() => expect(screen.getByText(/Review — Legacy Lee/)).toBeInTheDocument());
    // No per-item "Approve all remaining", but the three whole-submission actions remain.
    expect(screen.queryByRole('button', { name: /approve all remaining/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve & activate/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /send back for correction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject application/i })).toBeInTheDocument();
  });
});
