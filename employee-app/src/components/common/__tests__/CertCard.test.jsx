import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CertCard from '../CertCard';

describe('CertCard', () => {
  it('renders missing slot with Upload label', () => {
    const { container } = render(<CertCard slot={{ certType: 'TB Test', cert: null, status: 'missing' }} onUpload={vi.fn()} />);
    expect(container.querySelector('.cert-card--missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });

  it('renders approved with Replace label and expiration date', () => {
    const cert = { id: 1, certType: 'TB Test', expirationDate: '2027-01-01', updatedAt: '2026-06-01' };
    render(<CertCard slot={{ certType: 'TB Test', cert, status: 'approved' }} onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it('triggers onUpload when a file is chosen', () => {
    const onUpload = vi.fn().mockResolvedValue();
    const { container } = render(<CertCard slot={{ certType: 'CPR', cert: null, status: 'missing' }} onUpload={onUpload} />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'tb.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalled();
    expect(onUpload.mock.calls[0][0]).toBe(file);
  });

  it('lists stacked entries in the Other slot', () => {
    const others = [{ id: 10, certType: 'Background Check (Extra)' }, { id: 11, certType: 'Driver License' }];
    render(<CertCard slot={{ certType: 'Other', cert: null, status: 'missing', others }} onUpload={vi.fn()} />);
    expect(screen.getByText(/Background Check \(Extra\)/)).toBeInTheDocument();
    expect(screen.getByText(/Driver License/)).toBeInTheDocument();
  });
});
