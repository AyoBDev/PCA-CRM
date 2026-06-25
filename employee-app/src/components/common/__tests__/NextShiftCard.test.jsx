import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NextShiftCard from '../NextShiftCard';

describe('NextShiftCard', () => {
  it('renders empty state when shift is null', () => {
    render(<NextShiftCard shift={null} />);
    expect(screen.getByText(/no shifts scheduled/i)).toBeInTheDocument();
  });
  it('renders client and time', () => {
    const shift = { clientName: 'Jane Doe', shiftDate: new Date().toISOString(), startTime: '09:00', endTime: '13:00', serviceCode: 'PCS' };
    render(<NextShiftCard shift={shift} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/PCS/)).toBeInTheDocument();
  });
});
