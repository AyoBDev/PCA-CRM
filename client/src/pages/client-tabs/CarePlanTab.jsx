import { useState } from 'react';
import Icons from '../../components/common/Icons';

export default function CarePlanTab({
    client,
    timelineItems,
    openVisitModal,
    setConfirmDelete,
    formatDate,
    formatDateTime,
}) {
    const [expandedSections, setExpandedSections] = useState({
        timeline: true,
        diagnoses: true,
        mar: true,
        adl: true,
        assessment: true,
        encounter: true,
    });

    const toggleSection = (key) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="cp-tab-panel">
            {/* TIMELINE SECTION */}
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div
                    className="cp-card__header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSection('timeline')}
                >
                    <h3 className="cp-card__title">Activity Timeline</h3>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {expandedSections.timeline && (
                            <button
                                className="btn btn--outline btn--sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openVisitModal();
                                }}
                            >
                                {Icons.plus} Schedule Visit
                            </button>
                        )}
                        {expandedSections.timeline ? Icons.chevronDown : Icons.chevronRight}
                    </span>
                </div>
                {expandedSections.timeline && (
                    <div className="cp-card__body">
                        {timelineItems.length === 0 ? (
                            <div className="cp-empty-state-card">
                                <div className="cp-empty-state-card__icon">{Icons.clock}</div>
                                <p>No timeline events yet.</p>
                                <button className="btn btn--outline btn--sm" onClick={() => openVisitModal()}>
                                    Schedule First Visit
                                </button>
                            </div>
                        ) : (
                            <div className="cp-visit-timeline">
                                {timelineItems.map((item, i) => {
                                    if (item.type === 'visit') {
                                        const v = item.data;
                                        return (
                                            <div key={`v-${v.id}`} className="cp-visit-entry">
                                                <div className="cp-visit-entry__track">
                                                    <span
                                                        className={`cp-timeline-dot cp-timeline-dot--${
                                                            v.status === 'completed'
                                                                ? 'green'
                                                                : v.status === 'cancelled'
                                                                ? 'gray'
                                                                : 'blue'
                                                        }`}
                                                    />
                                                    {i < timelineItems.length - 1 && <span className="cp-timeline-line" />}
                                                </div>
                                                <div className="cp-visit-entry__card">
                                                    <div className="cp-visit-entry__top">
                                                        <div className="cp-visit-entry__title">
                                                            {v.purpose || 'Hospital Visit'}
                                                        </div>
                                                        <span
                                                            className={`ts-badge ts-badge--${
                                                                v.status === 'completed'
                                                                    ? 'submitted'
                                                                    : v.status === 'cancelled'
                                                                    ? 'draft'
                                                                    : 'upcoming'
                                                            }`}
                                                        >
                                                            {v.status.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="cp-visit-entry__meta">
                                                        {formatDateTime(v.visitDate, v.visitTime)}
                                                        {v.providerName && <> &bull; {v.providerName}</>}
                                                        {v.location && <> &bull; {v.location}</>}
                                                    </div>
                                                    <div className="cp-visit-entry__actions">
                                                        <button
                                                            className="btn btn--ghost btn--icon"
                                                            title="Edit"
                                                            onClick={() => openVisitModal(v)}
                                                        >
                                                            {Icons.edit}
                                                        </button>
                                                        <button
                                                            className="btn btn--danger-ghost btn--icon"
                                                            title="Delete"
                                                            onClick={() => setConfirmDelete({ type: 'visit', item: v })}
                                                        >
                                                            {Icons.trash}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    const note = item.data;
                                    return (
                                        <div key={`n-${note.id}`} className="cp-visit-entry">
                                            <div className="cp-visit-entry__track">
                                                <span
                                                    className="cp-timeline-dot"
                                                    style={{
                                                        background:
                                                            note.type === '60_DAY_RENEWAL'
                                                                ? '#f59e0b'
                                                                : note.type === '30_DAY_RENEWAL'
                                                                ? '#ef4444'
                                                                : '#8b5cf6',
                                                    }}
                                                />
                                                {i < timelineItems.length - 1 && <span className="cp-timeline-line" />}
                                            </div>
                                            <div className="cp-visit-entry__card">
                                                <div className="cp-visit-entry__top">
                                                    <span
                                                        className={`ts-badge ${
                                                            note.type === '60_DAY_RENEWAL'
                                                                ? 'ts-badge--draft'
                                                                : note.type === '30_DAY_RENEWAL'
                                                                ? 'ts-badge--critical'
                                                                : 'ts-badge--upcoming'
                                                        }`}
                                                    >
                                                        {note.type === '60_DAY_RENEWAL'
                                                            ? '60-Day Renewal'
                                                            : note.type === '30_DAY_RENEWAL'
                                                            ? '30-Day Renewal'
                                                            : 'Renewal Notice'}
                                                    </span>
                                                    <span className="cp-visit-entry__date">{formatDate(note.date)}</span>
                                                </div>
                                                <div
                                                    className="cp-visit-entry__meta"
                                                    style={{ whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}
                                                >
                                                    {note.content.substring(0, 300)}
                                                    {note.content.length > 300 ? '...' : ''}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* DIAGNOSES SECTION */}
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div
                    className="cp-card__header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSection('diagnoses')}
                >
                    <h3 className="cp-card__title">Diagnoses</h3>
                    <span>{expandedSections.diagnoses ? Icons.chevronDown : Icons.chevronRight}</span>
                </div>
                {expandedSections.diagnoses && (
                    <div className="cp-card__body">
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>Diagnoses tracking coming soon.</p>
                            <span className="cp-empty-text">
                                This section will include ICD-10 codes and diagnosis history.
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* MAR SECTION */}
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div
                    className="cp-card__header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSection('mar')}
                >
                    <h3 className="cp-card__title">Medication Administration Record</h3>
                    <span>{expandedSections.mar ? Icons.chevronDown : Icons.chevronRight}</span>
                </div>
                {expandedSections.mar && (
                    <div className="cp-card__body">
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>MAR tracking coming soon.</p>
                            <span className="cp-empty-text">
                                This section will include medication schedules and administration logs.
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ADL SECTION */}
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div
                    className="cp-card__header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSection('adl')}
                >
                    <h3 className="cp-card__title">Activities of Daily Living</h3>
                    <span>{expandedSections.adl ? Icons.chevronDown : Icons.chevronRight}</span>
                </div>
                {expandedSections.adl && (
                    <div className="cp-card__body">
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>ADL tracking coming soon.</p>
                            <span className="cp-empty-text">
                                This section will include ADL assessment scores and progress tracking.
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ASSESSMENT SECTION */}
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div
                    className="cp-card__header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSection('assessment')}
                >
                    <h3 className="cp-card__title">Assessments</h3>
                    <span>{expandedSections.assessment ? Icons.chevronDown : Icons.chevronRight}</span>
                </div>
                {expandedSections.assessment && (
                    <div className="cp-card__body">
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>Assessment tracking coming soon.</p>
                            <span className="cp-empty-text">
                                This section will include care assessments and evaluations.
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ENCOUNTER SECTION */}
            <div className="cp-card cp-card--elevated" style={{ marginBottom: 16 }}>
                <div
                    className="cp-card__header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSection('encounter')}
                >
                    <h3 className="cp-card__title">Encounters</h3>
                    <span>{expandedSections.encounter ? Icons.chevronDown : Icons.chevronRight}</span>
                </div>
                {expandedSections.encounter && (
                    <div className="cp-card__body">
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>Encounter tracking coming soon.</p>
                            <span className="cp-empty-text">
                                This section will include encounter notes and visit documentation.
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
