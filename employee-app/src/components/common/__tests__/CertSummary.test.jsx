import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CertSummary from '../CertSummary';

describe('CertSummary', () => {
  it('renders all four counts', () => {
    render(<CertSummary approved={3} pending={1} actionNeeded={4} total={8} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText(/action needed/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
  });
});
