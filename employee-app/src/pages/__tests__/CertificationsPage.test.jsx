import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CertificationsPage from '../CertificationsPage';

vi.mock('../../api', () => ({
  api: {
    getCertifications: vi.fn(),
    uploadCertification: vi.fn(),
    createCertification: vi.fn(),
    downloadCertUpload: vi.fn(),
  },
}));
import { api } from '../../api';

beforeEach(() => {
  vi.clearAllMocks();
  api.getCertifications.mockResolvedValue({
    certifications: [
      {
        requirementId: 40,
        certificationId: 90,
        certType: 'cpr',
        label: 'CPR',
        status: 'pending',
        reviewStatus: 'pending',
        expirationDate: null,
        requiresExpiry: true,
        renewalYears: 2,
        currentFile: { fileName: 'cpr.pdf' },
        uploads: [{ id: 500, fileName: 'cpr.pdf', fileType: 'application/pdf', fileSize: 1024, submittedAt: '2026-01-01T00:00:00.000Z' }],
      },
    ],
    summary: { approved: 0, pending: 1, actionNeeded: 0, total: 1 },
  });
});

test('renders one CertCard per ledger certification', async () => {
  render(<MemoryRouter><CertificationsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('CPR')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
});
