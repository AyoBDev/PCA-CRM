import { memo } from 'react';

function formatFullDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function MobileDayCard({ entry, dayIndex, updateEntry, disabled, enabledSections, dailyHoursFns, onAddShift, onRemoveShift, fieldErrors }) {
    const totalHours = enabledSections.reduce((sum, sec) => sum + (dailyHoursFns[sec.key]?.(entry) || 0), 0);

    return (
        <div className="pcaf-mcard">
            <div className="pcaf-mcard__header">
                <span className="pcaf-mcard__date">{formatFullDate(entry.dateOfService)}</span>
                <span className="pcaf-mcard__hours">{totalHours.toFixed(2)} hrs</span>
            </div>

            {enabledSections.map((sec) => {
                const activities = JSON.parse(entry[`${sec.key}Activities`] || '{}');
                let blocks = [];
                try { blocks = JSON.parse(entry[`${sec.key}TimeBlocks`] || '[]'); } catch {}
                const secHours = dailyHoursFns[sec.key]?.(entry) || 0;

                return (
                    <div key={sec.key} className="pcaf-mcard__section">
                        <div className={`pcaf-mcard__sec-header pcaf-mcard__sec-header--${sec.colorClass}`}>
                            {sec.title}
                        </div>

                        {/* Activities */}
                        <div className="pcaf-mcard__activities">
                            {sec.activities.map((act) => (
                                <label key={act} className="pcaf-mcard__activity">
                                    <span className="pcaf-mcard__activity-name">{act}</span>
                                    <input
                                        type="checkbox"
                                        checked={!!activities[act]}
                                        disabled={disabled}
                                        onChange={() => {
                                            const next = { ...activities, [act]: !activities[act] };
                                            updateEntry(dayIndex, `${sec.key}Activities`, JSON.stringify(next));
                                        }}
                                    />
                                </label>
                            ))}
                        </div>

                        {/* Initials */}
                        <div className="pcaf-mcard__initials">
                            <div className="pcaf-mcard__field">
                                <label>PCA Initials</label>
                                <input
                                    type="text"
                                    className={fieldErrors[`${dayIndex}-${sec.key}-pcaInitials`] ? 'pcaf-field-error' : ''}
                                    value={entry[`${sec.key}PcaInitials`] || ''}
                                    disabled={disabled}
                                    maxLength={4}
                                    onChange={(e) => updateEntry(dayIndex, `${sec.key}PcaInitials`, e.target.value.toUpperCase())}
                                />
                            </div>
                            <div className="pcaf-mcard__field">
                                <label>Client Initials</label>
                                <input
                                    type="text"
                                    className={fieldErrors[`${dayIndex}-${sec.key}-clientInitials`] ? 'pcaf-field-error' : ''}
                                    value={entry[`${sec.key}ClientInitials`] || ''}
                                    disabled={disabled}
                                    maxLength={4}
                                    onChange={(e) => updateEntry(dayIndex, `${sec.key}ClientInitials`, e.target.value.toUpperCase())}
                                />
                            </div>
                        </div>

                        {/* Shift 1 */}
                        <div className="pcaf-mcard__shift">
                            <span className="pcaf-mcard__shift-label">Shift 1</span>
                            <div className="pcaf-mcard__times">
                                <div className="pcaf-mcard__field">
                                    <label htmlFor={`${dayIndex}-${sec.key}-in`}>Time In</label>
                                    <input
                                        id={`${dayIndex}-${sec.key}-in`}
                                        type="time"
                                        className={fieldErrors[`${dayIndex}-${sec.key}-timeIn`] ? 'pcaf-field-error' : ''}
                                        value={entry[`${sec.key}TimeIn`] || ''}
                                        disabled={disabled}
                                        onChange={(e) => updateEntry(dayIndex, `${sec.key}TimeIn`, e.target.value)}
                                    />
                                </div>
                                <div className="pcaf-mcard__field">
                                    <label htmlFor={`${dayIndex}-${sec.key}-out`}>Time Out</label>
                                    <input
                                        id={`${dayIndex}-${sec.key}-out`}
                                        type="time"
                                        className={fieldErrors[`${dayIndex}-${sec.key}-timeOut`] ? 'pcaf-field-error' : ''}
                                        value={entry[`${sec.key}TimeOut`] || ''}
                                        disabled={disabled}
                                        onChange={(e) => updateEntry(dayIndex, `${sec.key}TimeOut`, e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Extra shifts */}
                        {blocks.map((block, b) => (
                            <div key={b} className={`pcaf-mcard__shift pcaf-mcard__shift--extra`}>
                                <span className="pcaf-mcard__shift-label">
                                    Shift {b + 2}
                                    {!disabled && b === blocks.length - 1 && (
                                        <button type="button" className="pcaf-remove-shift" onClick={() => onRemoveShift(sec.key, b)}>x</button>
                                    )}
                                </span>
                                <div className="pcaf-mcard__times">
                                    <div className="pcaf-mcard__field">
                                        <label>Time In</label>
                                        <input
                                            type="time"
                                            value={block.in || ''}
                                            disabled={disabled}
                                            onChange={(e) => {
                                                const updated = [...blocks];
                                                if (!updated[b]) updated[b] = { in: '', out: '' };
                                                updated[b] = { ...updated[b], in: e.target.value };
                                                updateEntry(dayIndex, `${sec.key}TimeBlocks`, JSON.stringify(updated));
                                            }}
                                        />
                                    </div>
                                    <div className="pcaf-mcard__field">
                                        <label>Time Out</label>
                                        <input
                                            type="time"
                                            value={block.out || ''}
                                            disabled={disabled}
                                            onChange={(e) => {
                                                const updated = [...blocks];
                                                if (!updated[b]) updated[b] = { in: '', out: '' };
                                                updated[b] = { ...updated[b], out: e.target.value };
                                                updateEntry(dayIndex, `${sec.key}TimeBlocks`, JSON.stringify(updated));
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Add Shift */}
                        {!disabled && (
                            <button type="button" className="pcaf-mcard__add-shift" onClick={() => onAddShift(sec.key)}>+ Add Shift</button>
                        )}

                        <div className="pcaf-mcard__sec-total">
                            <span>{sec.title} Total</span>
                            <span>{secHours.toFixed(2)} hrs ({Math.round(secHours * 4)} units)</span>
                        </div>
                    </div>
                );
            })}

            {/* Daily Total Bar */}
            <div className="pcaf-mcard__daily-total">
                <span className="pcaf-mcard__daily-total-label">Daily Total</span>
                <div>
                    <span className="pcaf-mcard__daily-total-value">{totalHours.toFixed(2)} hrs</span>
                    <span className="pcaf-mcard__daily-total-units">({Math.round(totalHours * 4)} units)</span>
                </div>
            </div>
        </div>
    );
}

export default memo(MobileDayCard);
