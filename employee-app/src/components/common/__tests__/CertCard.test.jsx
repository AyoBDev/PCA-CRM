import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import CertCard from '../CertCard';

const base = {
  label: 'CPR', status: 'expiring', statusLabel: 'Expiring',
  expirationDate: '2026-09-01', requiresExpiry: true, renewalYears: 2,
  hasFile: true, uploads: [{ id: 1, fileName: 'cpr.pdf' }],
  onView: vi.fn(), onUpload: vi.fn(),
};

describe('CertCard shared contract', () => {
  test('renders label and status', () => {
    render(<CertCard {...base} />);
    expect(screen.getByText('CPR')).toBeInTheDocument();
    expect(screen.getByText('Expiring')).toBeInTheDocument();
  });

  test('shows Replace when a file is present, Upload when not', () => {
    const { rerender } = render(<CertCard {...base} hasFile />);
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    rerender(<CertCard {...base} hasFile={false} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });
});
