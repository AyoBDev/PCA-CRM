import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MobileDayTabs from '../components/pca-form/MobileDayTabs';

describe('MobileDayTabs', () => {
    const defaultProps = {
        activeDay: 0,
        onDayChange: vi.fn(),
        entries: [
            { dayOfWeek: 0, adlTimeIn: '', adlTimeOut: '' },
            { dayOfWeek: 1, adlTimeIn: '09:00', adlTimeOut: '12:00' },
            { dayOfWeek: 2, adlTimeIn: '', adlTimeOut: '' },
            { dayOfWeek: 3, adlTimeIn: '', adlTimeOut: '' },
            { dayOfWeek: 4, adlTimeIn: '', adlTimeOut: '' },
            { dayOfWeek: 5, adlTimeIn: '', adlTimeOut: '' },
            { dayOfWeek: 6, adlTimeIn: '', adlTimeOut: '' },
        ],
        fieldErrors: {},
        enabledSections: ['adl'],
    };

    it('renders 7 day tabs plus ALL tab', () => {
        render(<MobileDayTabs {...defaultProps} />);
        expect(screen.getByText('SUN')).toBeInTheDocument();
        expect(screen.getByText('SAT')).toBeInTheDocument();
        expect(screen.getByText('ALL')).toBeInTheDocument();
    });

    it('highlights the active tab', () => {
        render(<MobileDayTabs {...defaultProps} activeDay={1} />);
        const monTab = screen.getByText('MON').closest('button');
        expect(monTab).toHaveClass('pcaf-mtab--active');
    });

    it('calls onDayChange when a tab is tapped', () => {
        const onDayChange = vi.fn();
        render(<MobileDayTabs {...defaultProps} onDayChange={onDayChange} />);
        fireEvent.click(screen.getByText('WED'));
        expect(onDayChange).toHaveBeenCalledWith(3);
    });

    it('shows a dot indicator for days with time entries', () => {
        const { container } = render(<MobileDayTabs {...defaultProps} />);
        const monTab = screen.getByText('MON').closest('button');
        expect(monTab.querySelector('.pcaf-mtab__dot--filled')).toBeInTheDocument();
    });

    it('shows a red dot for days with field errors', () => {
        const { container } = render(
            <MobileDayTabs {...defaultProps} fieldErrors={{ '2-adl-timeIn': 'Required' }} />
        );
        const tueTab = screen.getByText('TUE').closest('button');
        expect(tueTab.querySelector('.pcaf-mtab__dot--error')).toBeInTheDocument();
    });
});
