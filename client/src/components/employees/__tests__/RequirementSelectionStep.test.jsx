import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import RequirementSelectionStep from '../RequirementSelectionStep';

vi.mock('../../../api', () => ({
  getCatalogDocuments: () => Promise.resolve({ documentTypes: [{ id: 1, label: 'Government ID' }] }),
  getCatalogCertTypes: () => Promise.resolve({ certTypes: [{ id: 2, label: 'CPR', key: 'cpr' }] }),
  getCatalogPolicies: () => Promise.resolve({ policyDocuments: [{ id: 3, title: 'HIPAA' }] }),
}));

it('renders catalog items from all three catalogs', async () => {
  render(<RequirementSelectionStep value={{ documentTypeIds: [], certTypeIds: [], policyDocumentIds: [] }} onChange={() => {}} />);
  await waitFor(() => expect(screen.getByText('Government ID')).toBeInTheDocument());
  expect(screen.getByText('CPR')).toBeInTheDocument();
  expect(screen.getByText('HIPAA')).toBeInTheDocument();
});
