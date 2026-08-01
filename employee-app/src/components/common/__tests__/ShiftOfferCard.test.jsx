import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShiftOfferCard from '../ShiftOfferCard';

const OFFER = {
  id: 21,
  clientName: 'Jane Doe',
  address: '123 Main St, Las Vegas, NV',
  shiftDate: '2026-08-03T00:00:00.000Z',
  startTime: '09:00',
  endTime: '13:00',
  serviceCode: 'PCS',
  // A few seconds of slack: the remaining time floors, so an exact 9-minute
  // boundary would render as "8 min left" by the time the test asserts.
  expiresAt: new Date(Date.now() + 9 * 60 * 1000 + 5000).toISOString(),
};

describe('ShiftOfferCard', () => {
  it('renders the client, time and service', () => {
    render(<ShiftOfferCard offer={OFFER} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/9:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/PCS/)).toBeInTheDocument();
  });

  it('shows how long is left to respond', () => {
    render(<ShiftOfferCard offer={OFFER} />);
    // A time-boxed offer must say it is time-boxed, or a caregiver has no way
    // to know that waiting costs them the shift.
    expect(screen.getByText(/9 min/i)).toBeInTheDocument();
  });

  it('calls onRespond with accept', () => {
    const onRespond = vi.fn();
    render(<ShiftOfferCard offer={OFFER} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onRespond).toHaveBeenCalledWith(21, 'accept');
  });

  it('calls onRespond with decline', () => {
    const onRespond = vi.fn();
    render(<ShiftOfferCard offer={OFFER} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(onRespond).toHaveBeenCalledWith(21, 'decline');
  });

  it('disables both buttons while responding', () => {
    render(<ShiftOfferCard offer={OFFER} responding onRespond={vi.fn()} />);
    expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /decline/i })).toBeDisabled();
  });

  it('does not fire onRespond twice on a double tap', () => {
    const onRespond = vi.fn();
    const { rerender } = render(<ShiftOfferCard offer={OFFER} onRespond={onRespond} />);
    const accept = screen.getByRole('button', { name: /accept/i });
    fireEvent.click(accept);
    // Parent flips `responding` after the first tap; the second must be inert.
    rerender(<ShiftOfferCard offer={OFFER} responding onRespond={onRespond} />);
    fireEvent.click(accept);
    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it('renders the address as a maps link so the caregiver can judge the trip', () => {
    render(<ShiftOfferCard offer={OFFER} />);
    const link = screen.getByRole('link', { name: /123 Main St/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
  });

  it('renders nothing when there is no offer', () => {
    const { container } = render(<ShiftOfferCard offer={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an expiring state when the window has nearly closed', () => {
    const soon = { ...OFFER, expiresAt: new Date(Date.now() + 30 * 1000).toISOString() };
    render(<ShiftOfferCard offer={soon} />);
    expect(screen.getByText(/less than a minute/i)).toBeInTheDocument();
  });
});
