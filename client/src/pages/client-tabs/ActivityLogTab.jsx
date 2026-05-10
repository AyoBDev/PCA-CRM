import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';
import { useToast } from '../../hooks/useToast';

const ACTIVITY_TYPES = [
    { value: 'phone_in', label: 'Phone (Incoming)', icon: Icons.phone, color: '#22c55e' },
    { value: 'phone_out', label: 'Phone (Outgoing)', icon: Icons.phone, color: '#3b82f6' },
    { value: 'note', label: 'Note', icon: Icons.fileText, color: '#64748b' },
    { value: 'email', label: 'Email', icon: Icons.mail, color: '#8b5cf6' },
    { value: 'fax', label: 'Fax', icon: Icons.paperclip, color: '#f59e0b' },
    { value: 'in_person', label: 'In-Person Visit', icon: Icons.users, color: '#06b6d4' },
    { value: 'status_update', label: 'Status Update', icon: Icons.rotateCcw, color: '#f97316' },
    { value: 'follow_up', label: 'Follow-up Reminder', icon: Icons.clock, color: '#ef4444' },
];

function getTypeConfig(type) {
    return ACTIVITY_TYPES.find(t => t.value === type) || ACTIVITY_TYPES[2];
}

function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityLogTab({ clientId, isAdmin }) {
    const { showToast } = useToast();
    const [activities, setActivities] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [form, setForm] = useState({
        type: 'phone_in',
        subject: '',
        description: '',
        contactName: '',
        occurredAt: '',
    });

    const fetchActivities = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getClientActivities(clientId, page);
            setActivities(data.activities);
            setTotal(data.total);
            setPages(data.pages);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [clientId, page, showToast]);

    useEffect(() => { fetchActivities(); }, [fetchActivities]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.type || !form.subject.trim()) return;
        setSaving(true);
        try {
            const data = {
                type: form.type,
                subject: form.subject.trim(),
                description: form.description.trim(),
                contactName: form.contactName.trim(),
                occurredAt: form.occurredAt || new Date().toISOString(),
            };
            await api.createClientActivity(clientId, data);
            showToast('Activity recorded');
            setShowForm(false);
            setForm({ type: 'phone_in', subject: '', description: '', contactName: '', occurredAt: '' });
            setPage(1);
            fetchActivities();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteClientActivity(id);
            showToast('Activity deleted');
            fetchActivities();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    return (
        <div className="cp-tab-panel">
            <div className="cp-card">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">Activity Log</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{total} entries</span>
                        <button className="btn btn--primary btn--sm" onClick={() => setShowForm(!showForm)}>
                            {Icons.plus} Add Entry
                        </button>
                    </div>
                </div>
                <div className="cp-card__body">
                    {showForm && (
                        <form className="cal-form" onSubmit={handleSubmit}>
                            <div className="cal-form__grid">
                                <div className="form-group">
                                    <label>Type *</label>
                                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                        {ACTIVITY_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Subject *</label>
                                    <input
                                        type="text"
                                        value={form.subject}
                                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                        placeholder="Brief description"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Contact Name</label>
                                    <input
                                        type="text"
                                        value={form.contactName}
                                        onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Date/Time</label>
                                    <input
                                        type="datetime-local"
                                        value={form.occurredAt}
                                        onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: 12 }}>
                                <label>Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Additional details (optional)"
                                    rows={3}
                                />
                            </div>
                            <div className="form-actions" style={{ marginTop: 12 }}>
                                <button type="button" className="btn btn--outline btn--sm" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn--primary btn--sm" disabled={saving || !form.subject.trim()}>
                                    {saving ? 'Saving...' : 'Save Entry'}
                                </button>
                            </div>
                        </form>
                    )}

                    {loading ? (
                        <div className="cp-loading">
                            <div className="cp-loading__spinner" />
                            <div>Loading activities...</div>
                        </div>
                    ) : activities.length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clock}</div>
                            <p>No activity recorded yet.</p>
                            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                Click "Add Entry" to log a call, note, or visit.
                            </p>
                        </div>
                    ) : (
                        <div className="cal-timeline">
                            {activities.map(activity => {
                                const config = getTypeConfig(activity.type);
                                const isExpanded = expandedId === activity.id;
                                return (
                                    <div key={activity.id} className="cal-entry">
                                        <div className="cal-entry__icon" style={{ background: config.color }}>
                                            {config.icon}
                                        </div>
                                        <div className="cal-entry__content">
                                            <div className="cal-entry__subject">{activity.subject}</div>
                                            {activity.description && (
                                                <div
                                                    className={`cal-entry__desc ${isExpanded ? 'cal-entry__desc--expanded' : ''}`}
                                                    onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {activity.description}
                                                </div>
                                            )}
                                            <div className="cal-entry__meta">
                                                <span>{config.label}</span>
                                                {activity.contactName && <span>Contact: {activity.contactName}</span>}
                                                <span>Recorded by {activity.user?.name || 'Unknown'}</span>
                                                <span title={formatDateTime(activity.occurredAt)}>
                                                    {formatRelativeTime(activity.occurredAt)}
                                                </span>
                                            </div>
                                        </div>
                                        {isAdmin && (
                                            <div className="cal-entry__actions">
                                                <button
                                                    className="btn btn--ghost btn--icon btn--xs"
                                                    onClick={() => handleDelete(activity.id)}
                                                    title="Delete"
                                                >
                                                    {Icons.trash}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {pages > 1 && (
                        <div className="cal-pagination">
                            <button
                                className="btn btn--outline btn--sm"
                                disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                Previous
                            </button>
                            <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', alignSelf: 'center' }}>
                                Page {page} of {pages}
                            </span>
                            <button
                                className="btn btn--outline btn--sm"
                                disabled={page >= pages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
