import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import ProfilePage from '../ProfilePage';

vi.mock('../../api', () => ({
  api: {
    getProfile: () => Promise.resolve({ phone: '555', address: '1 St', emergencyContactName: 'Jane' }),
    updateProfile: vi.fn(), getRequirements: () => Promise.resolve({ requirements: [{ id: 1, kind: 'document', label: 'Government ID', status: 'approved' }] }),
  },
}));

it('shows the Documents section from the ledger', async () => {
  render(<MemoryRouter><ProfilePage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Government ID')).toBeInTheDocument());
});
