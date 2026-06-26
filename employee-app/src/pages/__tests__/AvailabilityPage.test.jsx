import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AvailabilityPage from '../AvailabilityPage';

vi.mock('../../api', () => ({
  api: {
    getAvailability: vi.fn(),
    getTimeOffRequests: vi.fn(),
    submitAvailabilityRequest: vi.fn(),
    submitTimeOff: vi.fn(),
  },
}));
import { api } from '../../api';

beforeEach(() => {
  vi.clearAllMocks();
  api.getAvailability.mockResolvedValue({
    schedule: { Sun: { on: false, in: '', out: '' }, Mon: { on: false, in: '', out: '' }, Tue: { on: false, in: '', out: '' }, Wed: { on: false, in: '', out: '' }, Thu: { on: false, in: '', out: '' }, Fri: { on: false, in: '', out: '' }, Sat: { on: false, in: '', out: '' } },
  });
  api.getTimeOffRequests.mockResolvedValue([]);
  api.submitAvailabilityRequest.mockResolvedValue({ id: 1 });
});

describe('AvailabilityPage save', () => {
  it("calls submitAvailabilityRequest with { requestedChanges: <form> } (not { schedule: ... })", async () => {
    render(<MemoryRouter><AvailabilityPage /></MemoryRouter>);
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalled());

    // Toggle Monday on by clicking its checkbox
    const monCheckbox = screen.getAllByRole('checkbox')[1]; // Sun=0, Mon=1
    fireEvent.click(monCheckbox);

    const saveBtn = screen.getByRole('button', { name: /save weekly/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(api.submitAvailabilityRequest).toHaveBeenCalled());

    const callArg = api.submitAvailabilityRequest.mock.calls[0][0];
    expect(callArg).toHaveProperty('requestedChanges');
    expect(callArg).not.toHaveProperty('schedule');
    expect(callArg.requestedChanges).toBeTruthy();
  });
});
