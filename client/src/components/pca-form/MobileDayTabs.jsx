import { memo } from 'react';

const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function hasTimeData(entry, sections) {
    for (const sec of sections) {
        if (entry[`${sec}TimeIn`] || entry[`${sec}TimeOut`]) return true;
    }
    return false;
}

function hasDayError(dayIdx, fieldErrors) {
    return Object.keys(fieldErrors).some(k => k.startsWith(`${dayIdx}-`));
}

function MobileDayTabs({ activeDay, onDayChange, entries, fieldErrors, enabledSections }) {
    return (
        <div className="pcaf-mtabs">
            {DAY_SHORT.map((label, idx) => {
                const filled = entries[idx] && hasTimeData(entries[idx], enabledSections);
                const hasError = hasDayError(idx, fieldErrors);
                return (
                    <button
                        key={idx}
                        type="button"
                        className={`pcaf-mtab ${activeDay === idx ? 'pcaf-mtab--active' : ''}`}
                        onClick={() => onDayChange(idx)}
                    >
                        <span className="pcaf-mtab__label">{label}</span>
                        <span className={`pcaf-mtab__dot ${filled ? 'pcaf-mtab__dot--filled' : ''} ${hasError ? 'pcaf-mtab__dot--error' : ''}`} />
                    </button>
                );
            })}
            <button
                type="button"
                className={`pcaf-mtab pcaf-mtab--all ${activeDay === 'all' ? 'pcaf-mtab--active' : ''}`}
                onClick={() => onDayChange('all')}
            >
                <span className="pcaf-mtab__label">ALL</span>
            </button>
        </div>
    );
}

export default memo(MobileDayTabs);
