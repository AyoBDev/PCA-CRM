import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CertCard from '../components/employee/CertCard';

const base = {
  label: 'CPR & First Aid', icon: <svg/>, colors: { accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  status: 'ok', statusLabel: 'Active', days: 288, expDate: '2027-05-27', renewalLabel: '2 years',
  onSelect: vi.fn(), onView: vi.fn(), onUpload: vi.fn(),
};

describe('CertCard', () => {
  it('renders name, status, expiry, renewal', () => {
    render(<CertCard {...base} hasFile selected={false} />);
    expect(screen.getByText('CPR & First Aid')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/2 years/)).toBeInTheDocument();
  });
  it('shows Replace when a file exists, Upload when not', () => {
    const { rerender } = render(<CertCard {...base} hasFile selected={false} />);
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    rerender(<CertCard {...base} hasFile={false} selected={false} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });
  it('fires onSelect on card click and onView on View', () => {
    render(<CertCard {...base} hasFile selected={false} />);
    fireEvent.click(screen.getByText('CPR & First Aid'));
    expect(base.onSelect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(base.onView).toHaveBeenCalled();
  });
  it('adds is-selected when selected', () => {
    const { container } = render(<CertCard {...base} hasFile selected />);
    expect(container.querySelector('.cert-card.is-selected')).toBeInTheDocument();
  });
  it('renders a progress bar element', () => {
    const { container } = render(<CertCard {...base} hasFile selected={false} />);
    expect(container.querySelector('.cert-card__progress')).toBeInTheDocument();
  });
});
