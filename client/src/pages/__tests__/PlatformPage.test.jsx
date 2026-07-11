import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../api', () => ({
  listPlatformAgencies: vi.fn().mockResolvedValue([
    { id: 1, name: 'NV Best PCA', slug: 'nvbest', status: 'active', userCount: 4, clientCount: 12, createdAt: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'Acme Care', slug: 'acme', status: 'suspended', userCount: 1, clientCount: 0, createdAt: '2026-06-01T00:00:00Z' },
  ]),
  createPlatformAgency: vi.fn().mockResolvedValue({ agency: { id: 3 } }),
  suspendAgency: vi.fn(),
  reactivateAgency: vi.fn(),
  impersonateAgency: vi.fn().mockResolvedValue({ token: 't', subdomainUrl: 'http://acme.localhost' }),
}));

import * as api from '../../api';
import PlatformPage from '../PlatformPage';

function renderPage() {
  return render(<MemoryRouter><PlatformPage /></MemoryRouter>);
}

test('lists agencies with status and counts', async () => {
  renderPage();
  expect(await screen.findByText('NV Best PCA')).toBeInTheDocument();
  expect(screen.getByText('Acme Care')).toBeInTheDocument();
  expect(screen.getByText(/suspended/i)).toBeInTheDocument();
});

test('create agency form submits name, slug and admin details', async () => {
  renderPage();
  await screen.findByText('NV Best PCA');
  fireEvent.click(screen.getByRole('button', { name: /new agency/i }));
  fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: 'Beta Care' } });
  fireEvent.change(screen.getByLabelText(/subdomain/i), { target: { value: 'beta' } });
  fireEvent.change(screen.getByLabelText(/admin email/i), { target: { value: 'a@beta.test' } });
  fireEvent.change(screen.getByLabelText(/admin name/i), { target: { value: 'Beta Admin' } });
  fireEvent.click(screen.getByRole('button', { name: /create agency/i }));
  await waitFor(() =>
    expect(api.createPlatformAgency).toHaveBeenCalledWith({
      name: 'Beta Care', slug: 'beta', adminEmail: 'a@beta.test', adminName: 'Beta Admin',
    })
  );
});
