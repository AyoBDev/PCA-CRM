import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SchedulePage from '../SchedulePage';

vi.mock('../../api', () => ({
  api: {
    getWeekSchedule: vi.fn(),
  },
}));
import { api } from '../../api';

beforeEach(() => {
  vi.clearAllMocks();
});

function baseShift(overrides = {}) {
  return {
    id: 1,
    shiftDate: '2026-08-17',
    startTime: '09:00',
    endTime: '12:00',
    serviceCode: 'PCS',
    client: {
      clientName: 'Jane Doe',
      address: '1 Main',
      phone: '555',
      gateCode: '',
      mainServices: '',
      carePlanSchedule: '',
      caregiverRequirements: '',
    },
    ...overrides,
  };
}

test('expanding a shift shows the care-plan blocks that are non-empty', async () => {
  api.getWeekSchedule.mockResolvedValue({
    weekStart: '2026-08-16T00:00:00.000Z',
    shifts: [
      baseShift({
        client: {
          clientName: 'Jane Doe',
          address: '1 Main',
          phone: '555',
          gateCode: '',
          mainServices: 'Bathing, grooming',
          carePlanSchedule: 'MWF mornings',
          caregiverRequirements: 'Female caregiver',
        },
      }),
    ],
  });

  render(<MemoryRouter><SchedulePage /></MemoryRouter>);
  await waitFor(() => expect(document.querySelector('.shift-card__client')).toBeInTheDocument());

  // Expand the card via the real affordance: clicking the shift-card div
  document.querySelector('.shift-card__client').closest('.shift-card').click();

  await waitFor(() => {
    expect(screen.getByText('Care Plan')).toBeInTheDocument();
    expect(screen.getByText(/Bathing, grooming/)).toBeInTheDocument();
    expect(screen.getByText(/MWF mornings/)).toBeInTheDocument();
    expect(screen.getByText(/Female caregiver/)).toBeInTheDocument();
  });
});

test('does not render the Care Plan heading when all three fields are empty', async () => {
  api.getWeekSchedule.mockResolvedValue({
    weekStart: '2026-08-16T00:00:00.000Z',
    shifts: [baseShift()],
  });

  render(<MemoryRouter><SchedulePage /></MemoryRouter>);
  await waitFor(() => expect(document.querySelector('.shift-card__client')).toBeInTheDocument());

  document.querySelector('.shift-card__client').closest('.shift-card').click();

  await waitFor(() => {
    // Something else in the details section should be visible to prove expansion happened
    expect(screen.getByText('Phone:')).toBeInTheDocument();
  });

  expect(screen.queryByText('Care Plan')).not.toBeInTheDocument();
});
