import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MobileDayCard from '../components/pca-form/MobileDayCard';

describe('MobileDayCard', () => {
    const entry = {
        dayOfWeek: 1,
        dateOfService: '2026-06-02',
        adlActivities: '{}',
        adlTimeIn: '09:00',
        adlTimeOut: '12:00',
        adlPcaInitials: 'JD',
        adlClientInitials: 'SM',
        adlTimeBlocks: '[]',
    };

    const defaultProps = {
        entry,
        dayIndex: 1,
        updateEntry: vi.fn(),
        disabled: false,
        enabledSections: [{ key: 'adl', title: 'PAS', colorClass: 'pas', activities: ['Bathing', 'Dressing'] }],
        dailyHoursFns: { adl: () => 3.0 },
        onAddShift: vi.fn(),
        onRemoveShift: vi.fn(),
        fieldErrors: {},
    };

    it('renders the day name and full date', () => {
        render(<MobileDayCard {...defaultProps} />);
        expect(screen.getByText('Tuesday, June 2')).toBeInTheDocument();
    });

    it('renders activity checkboxes', () => {
        render(<MobileDayCard {...defaultProps} />);
        expect(screen.getByLabelText('Bathing')).toBeInTheDocument();
        expect(screen.getByLabelText('Dressing')).toBeInTheDocument();
    });

    it('renders time inputs with values', () => {
        render(<MobileDayCard {...defaultProps} />);
        const timeIn = screen.getByLabelText('Time In');
        expect(timeIn.value).toBe('09:00');
    });

    it('calls updateEntry when time is changed', () => {
        const updateEntry = vi.fn();
        render(<MobileDayCard {...defaultProps} updateEntry={updateEntry} />);
        fireEvent.change(screen.getByLabelText('Time In'), { target: { value: '10:00' } });
        expect(updateEntry).toHaveBeenCalledWith(1, 'adlTimeIn', '10:00');
    });

    it('shows Add Shift button', () => {
        render(<MobileDayCard {...defaultProps} />);
        expect(screen.getByText('+ Add Shift')).toBeInTheDocument();
    });

    it('shows daily total hours', () => {
        render(<MobileDayCard {...defaultProps} />);
        expect(screen.getByText('3.00 hrs')).toBeInTheDocument();
    });
});
