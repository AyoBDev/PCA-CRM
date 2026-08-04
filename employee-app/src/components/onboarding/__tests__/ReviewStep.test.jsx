import { render, screen } from '@testing-library/react';
import ReviewStep from '../ReviewStep';

it('blocks submit when a required item is incomplete', () => {
  render(<ReviewStep requirements={[{ id: 1, kind: 'document', label: 'ID', status: 'required' }]} personal={{}} emergency={{}} onSubmit={() => {}} />);
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
});
