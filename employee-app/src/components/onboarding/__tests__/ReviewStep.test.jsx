import { render, screen } from '@testing-library/react';
import ReviewStep from '../ReviewStep';

it('blocks submit when a required item is incomplete', () => {
  render(<ReviewStep requirements={[{ id: 1, kind: 'document', label: 'ID', status: 'required' }]} personal={{}} emergency={{}} onSubmit={() => {}} />);
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
});

it('does NOT block submit when the only incomplete item is optional', () => {
  render(<ReviewStep
    requirements={[
      { id: 1, kind: 'policy', label: 'HIPAA', status: 'approved', optional: false },
      { id: 2, kind: 'certification', label: 'CPR', status: 'required', optional: true },
    ]}
    personal={{}} emergency={{}} onSubmit={() => {}} />);
  expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  expect(screen.getByText(/optional items can be completed later/i)).toBeInTheDocument();
});
