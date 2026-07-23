import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';
import { useToast } from '../../hooks/useToast';
import NotesExportButton from '../../components/common/NotesExportButton';

// Mirrors client-tabs/NotesTab so the two read identically — same timeline
// markup, same filter chips, same relative timestamps.
const SOURCE_CONFIG = {
    employee: { label: 'General', icon: Icons.fileText, color: '#64748b' },
    callout: { label: 'Callout', icon: Icons.alertTriangle, color: '#f59e0b' },
    offer: { label: 'Shift offer', icon: Icons.calendar, color: '#06b6d4' },
    phoneNote: { label: 'Phone note', icon: Icons.phone, color: '#8b5cf6' },
};

function getSourceConfig(source) {
    return SOURCE_CONFIG[source] || SOURCE_CONFIG.employee;
}

function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const diffMins = Math.floor((new Date() - date) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Internal notes for one employee — callouts, offer responses, and what was
 * said on the phone.
 *
 * ADMIN-ONLY. There is deliberately no employee-portal equivalent: this is the
 * record an agency uses to see the pattern behind complaints and attendance,
 * and a caregiver who knew their callouts were being tallied would report them
 * differently. The banner below states that plainly, so whoever is reading it
 * knows the material is internal.
 */
export default function EmployeeNotesTab({ employeeId }) {
    const { showToast } = useToast();
    const [notes, setNotes] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [expandedIdx, setExpandedIdx] = useState(null);
    const [activeSources, setActiveSources] = useState(null);

    const fetchNotes = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getEmployeeNotesTimeline(employeeId, page);
            setNotes(data.notes);
            setTotal(data.total);
            setPages(data.pages);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [employeeId, page, showToast]);

    useEffect(() => { fetchNotes(); }, [fetchNotes]);

    const presentSources = [...new Set(notes.map(n => n.source))];

    const toggleSource = (source) => {
        setActiveSources(prev => {
            const base = prev === null ? new Set(presentSources) : new Set(prev);
            if (base.has(source)) base.delete(source);
            else base.add(source);
            if (base.size === presentSources.length) return null;
            return base;
        });
    };

    const visibleNotes = activeSources === null
        ? notes
        : notes.filter(n => activeSources.has(n.source));

    return (
        <div className="cp-tab-panel">
            <div className="cp-card">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">Notes</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{total} entries</span>
                        <NotesExportButton
                            disabled={loading}
                            onExport={(range) => api.exportEmployeeNotesPdf(employeeId, range)}
                        />
                    </div>
                </div>
                <div className="cp-card__body">
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', marginBottom: 16, borderRadius: 'var(--radius)',
                        background: 'hsl(var(--muted))', fontSize: 12,
                        color: 'hsl(var(--muted-foreground))',
                    }}>
                        <span style={{ color: 'hsl(var(--warning))' }}>{Icons.shieldCheck}</span>
                        Internal record — not visible to the employee.
                    </div>

                    {presentSources.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                            <button
                                className={`btn btn--sm ${activeSources === null ? 'btn--primary' : 'btn--outline'}`}
                                onClick={() => setActiveSources(null)}
                            >
                                All
                            </button>
                            {presentSources.map(source => {
                                const config = getSourceConfig(source);
                                const isActive = activeSources === null || activeSources.has(source);
                                return (
                                    <button
                                        key={source}
                                        className={`btn btn--sm ${isActive ? 'btn--primary' : 'btn--outline'}`}
                                        onClick={() => toggleSource(source)}
                                    >
                                        {config.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {loading ? (
                        <div className="cp-loading">
                            <div className="cp-loading__spinner" />
                            <div>Loading notes...</div>
                        </div>
                    ) : visibleNotes.length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.fileText}</div>
                            <p>No notes recorded for this employee yet.</p>
                            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                Callouts, shift offers, and notes taken on the phone appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="cal-timeline">
                            {visibleNotes.map((note, idx) => {
                                const config = getSourceConfig(note.source);
                                const isExpanded = expandedIdx === idx;
                                return (
                                    <div key={idx} className="cal-entry">
                                        <div className="cal-entry__icon" style={{ background: config.color }}>
                                            {config.icon}
                                        </div>
                                        <div className="cal-entry__content">
                                            <div className="cal-entry__subject">{note.sourceLabel}</div>
                                            <div
                                                className={`cal-entry__desc ${isExpanded ? 'cal-entry__desc--expanded' : ''}`}
                                                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {note.content}
                                            </div>
                                            <div className="cal-entry__meta">
                                                <span>{config.label}</span>
                                                {note.author && <span>Recorded by {note.author}</span>}
                                                <span title={formatDateTime(note.date)}>
                                                    {formatRelativeTime(note.date)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {pages > 1 && (
                        <div className="cal-pagination">
                            <button className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                Previous
                            </button>
                            <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', alignSelf: 'center' }}>
                                Page {page} of {pages}
                            </span>
                            <button className="btn btn--outline btn--sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
