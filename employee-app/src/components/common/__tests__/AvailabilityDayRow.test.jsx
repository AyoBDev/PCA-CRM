import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AvailabilityDayRow from '../AvailabilityDayRow';

describe('AvailabilityDayRow', () => {
  it('shows time inputs when on=true', () => {
    render(<AvailabilityDayRow day="Mon" value={{ on: true, in: '09:00', out: '17:00' }} onChange={vi.fn()} />);
    expect(screen.getAllByDisplayValue(/9|09/)).not.toHaveLength(0);
  });

  it('hides time inputs when on=false', () => {
    const { container } = render(<AvailabilityDayRow day="Mon" value={{ on: false, in: '', out: '' }} onChange={vi.fn()} />);
    expect(container.querySelectorAll('input[type="time"]').length).toBe(0);
  });

  it('emits onChange when toggle flips', () => {
    const onChange = vi.fn();
    const { container } = render(<AvailabilityDayRow day="Mon" value={{ on: false, in: '', out: '' }} onChange={onChange} />);
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(onChange).toHaveBeenCalledWith({ on: true, in: '09:00', out: '17:00' });
  });

  it('emits onChange when a time changes', () => {
    const onChange = vi.fn();
    const { container } = render(<AvailabilityDayRow day="Mon" value={{ on: true, in: '09:00', out: '17:00' }} onChange={onChange} />);
    fireEvent.change(container.querySelectorAll('input[type="time"]')[0], { target: { value: '10:00' } });
    expect(onChange).toHaveBeenCalledWith({ on: true, in: '10:00', out: '17:00' });
  });
});
