import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityFeed from '../ActivityFeed';

function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'new-shift',
    title: `Item ${i + 1}`,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    href: '/schedule',
  }));
}

describe('ActivityFeed', () => {
  it('renders only the first `limit` items', () => {
    render(<MemoryRouter><ActivityFeed items={makeItems(10)} limit={3} /></MemoryRouter>);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
    expect(screen.queryByText('Item 4')).toBeNull();
  });

  it('expands when "See more" is clicked', () => {
    render(<MemoryRouter><ActivityFeed items={makeItems(8)} limit={3} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /see more/i }));
    expect(screen.getByText('Item 8')).toBeInTheDocument();
  });

  it('does not show "See more" when items fit', () => {
    render(<MemoryRouter><ActivityFeed items={makeItems(2)} limit={5} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /see more/i })).toBeNull();
  });

  it('renders empty state when no items', () => {
    render(<MemoryRouter><ActivityFeed items={[]} limit={5} /></MemoryRouter>);
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
  });
});
