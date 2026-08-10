import { render, screen } from '@testing-library/react';
import DocumentsStep from '../DocumentsStep';

it('renders only document requirements', () => {
  const requirements = [
    { id: 1, kind: 'document', label: 'Government ID', status: 'required', requiresExpiry: true },
    { id: 2, kind: 'policy', label: 'HIPAA', status: 'required' },
  ];
  render(<DocumentsStep requirements={requirements} onUpload={() => {}} />);
  expect(screen.getByText('Government ID')).toBeInTheDocument();
  expect(screen.queryByText('HIPAA')).not.toBeInTheDocument();
});
