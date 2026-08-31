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
        status: 'active',
        reviewStatus: 'approved',
        expirationDate: '2099-01-01T00:00:00.000Z',
        requiresExpiry: true,
        renewalYears: 2,
        currentFile: { fileName: 'cpr.pdf' },
        uploads: [{ id: 500, fileName: 'cpr.pdf', fileType: 'application/pdf', fileSize: 1024, submittedAt: '2026-01-01T00:00:00.000Z' }],
      },
    ],
    summary: { approved: 1, pending: 0, actionNeeded: 0, total: 1 },
  });
});

test('renders one portfolio card per ledger certification with Upload control', async () => {
  render(<MemoryRouter><CertificationsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('CPR')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
});

test('renders the admin-style status badge and renewal period', async () => {
  render(<MemoryRouter><CertificationsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('CPR')).toBeInTheDocument());
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText('2yr')).toBeInTheDocument();
});

test('View Details expands the file-history list', async () => {
  render(<MemoryRouter><CertificationsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('CPR')).toBeInTheDocument());
  screen.getByRole('button', { name: /view details/i }).click();
  await waitFor(() => expect(screen.getByText('cpr.pdf')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
});

test('a pending renewal with a past expiration shows Pending Review, not Expired', async () => {
  // Employee just uploaded a renewal: the cert is status:'pending' server-side,
  // even though its (old) expiration date is in the past. The card must reflect
  // the review status, not derive "Expired" from the stale date.
  api.getCertifications.mockResolvedValueOnce({
    certifications: [
      {
        requirementId: 56,
        certificationId: 3140,
        certType: 'background_check',
        label: 'Background Check',
        status: 'pending',
        reviewStatus: 'approved',
        expirationDate: '2020-01-01T00:00:00.000Z', // in the past
        requiresExpiry: true,
        renewalYears: 5,
        currentFile: { fileName: 'bg-check.pdf' },
        uploads: [{ id: 3838, fileName: 'renewal.pdf', fileType: 'application/pdf', fileSize: 2048, submittedAt: '2026-08-31T00:00:00.000Z' }],
      },
    ],
    summary: { approved: 0, pending: 1, actionNeeded: 0, total: 1 },
  });
  render(<MemoryRouter><CertificationsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Background Check')).toBeInTheDocument());
  expect(screen.getByText(/pending review/i)).toBeInTheDocument();
  expect(screen.queryByText('Expired')).not.toBeInTheDocument();
});
