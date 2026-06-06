import { memo } from 'react';
import SignaturePad from '../common/SignaturePad';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function countActivities(entry, sections) {
    let count = 0;
    for (const sec of sections) {
        try {
            const acts = JSON.parse(entry[`${sec}Activities`] || '{}');
            count += Object.values(acts).filter(Boolean).length;
        } catch {}
    }
    return count;
}

function getDayStatus(entry, dayIdx, sections, fieldErrors) {
    const hasError = Object.keys(fieldErrors).some(k => k.startsWith(`${dayIdx}-`));
    if (hasError) return 'error';
    for (const sec of sections) {
        if (entry[`${sec}TimeIn`] && entry[`${sec}TimeOut`]) return 'complete';
    }
    return 'empty';
}

function getMissingFields(dayIdx, fieldErrors) {
    const missing = [];
    Object.keys(fieldErrors).forEach(k => {
        if (k.startsWith(`${dayIdx}-`)) {
            const parts = k.split('-');
            const field = parts[2];
            if (field === 'timeIn') missing.push('Time In');
            else if (field === 'timeOut') missing.push('Time Out');
            else if (field === 'pcaInitials') missing.push('PCA Initials');
            else if (field === 'clientInitials') missing.push('Client Initials');
        }
    });
    return [...new Set(missing)];
}

function MobileSummaryTab({
    entries, enabledSectionKeys, dailyHoursFns, fieldErrors, onDayChange,
    totalPas, totalHm, totalRespite, totalCompanion, totalAll,
    authLimits, pasEnabled, hmEnabled, respiteEnabled, companionEnabled,
    pcaFullName, setPcaFullName, recipientName, setRecipientName,
    pcaSig, setPcaSig, recipientSig, setRecipientSig,
    submitted, setHasUnsavedChanges, submitAttempted,
}) {
    return (
        <div className="pcaf-msummary">
            {/* Day summary rows */}
            <div className="pcaf-msummary__days">
                {entries.map((entry, idx) => {
                    const actCount = countActivities(entry, enabledSectionKeys);
                    const hours = enabledSectionKeys.reduce((sum, sec) => sum + (dailyHoursFns[sec]?.(entry) || 0), 0);
                    const status = getDayStatus(entry, idx, enabledSectionKeys, fieldErrors);
                    const missing = status === 'error' ? getMissingFields(idx, fieldErrors) : [];
                    const dateStr = entry.dateOfService
                        ? new Date(entry.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '';

                    return (
                        <button key={idx} type="button" className={`pcaf-msummary__day pcaf-msummary__day--${status}`} onClick={() => onDayChange(idx)}>
                            <div className="pcaf-msummary__day-left">
                                <span className="pcaf-msummary__day-name">{DAY_NAMES[idx]}</span>
                                <span className="pcaf-msummary__day-date">{dateStr}</span>
                            </div>
                            <div className="pcaf-msummary__day-mid">
                                {actCount > 0 && <span className="pcaf-msummary__acts">{actCount} activities</span>}
                            </div>
                            <div className="pcaf-msummary__day-right">
                                <span className="pcaf-msummary__hours">{hours > 0 ? `${hours.toFixed(2)} hrs` : '—'}</span>
                                {status === 'complete' && <span className="pcaf-msummary__check">✓</span>}
                                {status === 'error' && <span className="pcaf-msummary__warn">!</span>}
                            </div>
                            {missing.length > 0 && (
                                <div className="pcaf-msummary__missing">Missing: {missing.join(', ')}</div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Weekly totals */}
            <div className="pcaf-msummary__totals">
                <div className="pcaf-msummary__total-row">
                    <span>Total Hours</span>
                    <strong>{totalAll.toFixed(2)} hrs ({Math.round(totalAll * 4)} units)</strong>
                </div>
                {pasEnabled && (
                    <div className="pcaf-msummary__total-row pcaf-msummary__total-row--pas">
                        <span>PAS</span>
                        <strong>{totalPas.toFixed(2)} hrs{authLimits.PAS ? ` / ${authLimits.PAS.hours} authorized` : ''}</strong>
                    </div>
                )}
                {hmEnabled && (
                    <div className="pcaf-msummary__total-row pcaf-msummary__total-row--hm">
                        <span>Homemaker</span>
                        <strong>{totalHm.toFixed(2)} hrs{authLimits.Homemaker ? ` / ${authLimits.Homemaker.hours} authorized` : ''}</strong>
                    </div>
                )}
                {respiteEnabled && (
                    <div className="pcaf-msummary__total-row pcaf-msummary__total-row--respite">
                        <span>Respite</span>
                        <strong>{totalRespite.toFixed(2)} hrs{authLimits.Respite ? ` / ${authLimits.Respite.hours} authorized` : ''}</strong>
                    </div>
                )}
                {companionEnabled && (
                    <div className="pcaf-msummary__total-row pcaf-msummary__total-row--companion">
                        <span>Companion</span>
                        <strong>{(totalCompanion || 0).toFixed(2)} hrs{authLimits.Companion ? ` / ${authLimits.Companion.hours} authorized` : ''}</strong>
                    </div>
                )}
            </div>

            {/* Signatures */}
            <div className="pcaf-msummary__signatures">
                <h3 className="pcaf-msummary__sig-title">SIGNATURES</h3>
                <div className="pcaf-msummary__sig-field">
                    <label>PCA (Caregiver) Name *</label>
                    <input
                        type="text"
                        value={pcaFullName}
                        onChange={(e) => { setPcaFullName(e.target.value); setHasUnsavedChanges(true); }}
                        disabled={submitted}
                        placeholder="Jane A. Doe"
                        className={submitAttempted && !pcaFullName.trim() ? 'pcaf-field-error' : ''}
                    />
                </div>
                <div className="pcaf-msummary__sig-pad">
                    <SignaturePad label="PCA (Caregiver) Signature *" value={pcaSig} onChange={(v) => { setPcaSig(v); setHasUnsavedChanges(true); }} disabled={submitted} />
                </div>
                <div className="pcaf-msummary__sig-field">
                    <label>Recipient (Client) Name *</label>
                    <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => { setRecipientName(e.target.value); setHasUnsavedChanges(true); }}
                        disabled={submitted}
                        placeholder="John B. Client"
                        className={submitAttempted && !recipientName.trim() ? 'pcaf-field-error' : ''}
                    />
                </div>
                <div className="pcaf-msummary__sig-pad">
                    <SignaturePad label="Recipient (Client) Signature *" value={recipientSig} onChange={(v) => { setRecipientSig(v); setHasUnsavedChanges(true); }} disabled={submitted} />
                </div>
            </div>
        </div>
    );
}

export default memo(MobileSummaryTab);
