import { useState, useEffect } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';
import { TIMESHEET_STATUS_STYLES, TIMESHEET_SERVICE_COLORS } from '../../utils/constants';

const STATUS_STYLES = TIMESHEET_STATUS_STYLES;

function formatWeekLabel(weekStart) {
    if (!weekStart) return '—';
    const ws = new Date(weekStart);
    const we = new Date(ws);
    we.setUTCDate(we.getUTCDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${fmt(ws)} – ${fmt(we)}, ${ws.getUTCFullYear()}`;
}

export default function TimesheetsTab({ client, navigate }) {
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetch() {
            try {
                const all = await api.getTimesheets();
                const filtered = all.filter(t => t.clientId === client.id || (t.client && t.client.clientName === client.clientName));
                if (!cancelled) setTimesheets(filtered);
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        }
        fetch();
        return () => { cancelled = true; };
    }, [client.id]);

    const totalHours = timesheets.reduce((s, t) => s + (t.totalHours || 0), 0);
    const submitted = timesheets.filter(t => t.status === 'submitted').length;
    const accepted = timesheets.filter(t => t.status === 'accepted').length;

    if (loading) return <div className="cp-tab-panel"><div className="cp-empty-state-card"><p>Loading timesheets...</p></div></div>;

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        {Icons.clipboard} Timesheets
                        {timesheets.length > 0 && <span className="cp-card__count">{timesheets.length}</span>}
                    </h3>
                    <button className="btn btn--outline btn--sm" onClick={() => navigate('/timesheets')}>
                        {Icons.list} View All
                    </button>
                </div>
                <div className="cp-card__body">
                    {timesheets.length === 0 ? (
                        <div className="cp-empty-state-card">
                            <div className="cp-empty-state-card__icon">{Icons.clipboard}</div>
                            <p>No timesheets found for this client.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 14px', background: 'hsl(var(--muted))', borderRadius: 8 }}>
                                <div style={{ fontSize: 13 }}>
                                    <strong>{timesheets.length}</strong> total
                                </div>
                                <div style={{ fontSize: 13, color: '#2563eb' }}>
                                    <strong>{submitted}</strong> submitted
                                </div>
                                <div style={{ fontSize: 13, color: '#16a34a' }}>
                                    <strong>{accepted}</strong> accepted
                                </div>
                                <div style={{ marginLeft: 'auto', fontSize: 13 }}>
                                    <strong>{totalHours.toFixed(1)}</strong> total hrs
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {timesheets.map(ts => {
                                    const statusInfo = STATUS_STYLES[ts.status] || STATUS_STYLES.draft;
                                    return (
                                        <div
                                            key={ts.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                                padding: '10px 14px',
                                                borderRadius: 8,
                                                border: '1px solid hsl(var(--border))',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onClick={() => navigate(`/timesheets?open=${ts.id}`)}
                                            onMouseEnter={e => e.currentTarget.style.background = 'hsl(var(--muted) / 0.4)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>{ts.pcaName || '—'}</div>
                                                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                                                    {formatWeekLabel(ts.weekStart)}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                                                {ts.totalPasHours > 0 && (
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.PAS }}>PAS {ts.totalPasHours.toFixed(2)}h</span>
                                                )}
                                                {ts.totalHmHours > 0 && (
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.Homemaker }}>HM {ts.totalHmHours.toFixed(2)}h</span>
                                                )}
                                                {(ts.totalRespiteHours || 0) > 0 && (
                                                    <span style={{ color: TIMESHEET_SERVICE_COLORS.Respite }}>RP {ts.totalRespiteHours.toFixed(2)}h</span>
                                                )}
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{ts.totalHours?.toFixed(1) || '0.0'}h</span>
                                            </div>
                                            <span style={{
                                                fontSize: 11,
                                                fontWeight: 600,
                                                padding: '3px 8px',
                                                borderRadius: 4,
                                                background: statusInfo.bg,
                                                color: statusInfo.color,
                                                textTransform: 'capitalize',
                                            }}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
