import { useState, useEffect } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';

function formatWeekRange(weekStart) {
    if (!weekStart) return '—';
    const ws = new Date(weekStart);
    const we = new Date(ws);
    we.setUTCDate(we.getUTCDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${fmt(ws)} – ${fmt(we)}`;
}

export default function TimesheetsTab({ client, navigate }) {
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function fetch() {
            try {
                const all = await api.getTimesheets();
                const filtered = all.filter(t => t.clientId === client.id);
                if (!cancelled) setTimesheets(filtered);
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        }
        fetch();
        return () => { cancelled = true; };
    }, [client.id]);

    if (loading) return <div className="cp-tab-panel"><p style={{ color: 'hsl(var(--muted-foreground))' }}>Loading timesheets...</p></div>;

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        {Icons.clipboard} Timesheets
                        {timesheets.length > 0 && <span className="cp-card__count">{timesheets.length}</span>}
                    </h3>
                </div>
                <div className="cp-card__body">
                    {timesheets.length === 0 ? (
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>No timesheets found for this client.</p>
                    ) : (
                        <table className="sheet-table" style={{ fontSize: 13 }}>
                            <thead>
                                <tr>
                                    <th>Caregiver</th>
                                    <th>Week</th>
                                    <th>PAS Hrs</th>
                                    <th>HM Hrs</th>
                                    <th>Respite Hrs</th>
                                    <th>Total Hrs</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timesheets.map(ts => (
                                    <tr key={ts.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`timesheets`)}>
                                        <td>{ts.pcaName || '—'}</td>
                                        <td>{formatWeekRange(ts.weekStart)}</td>
                                        <td>{ts.totalPasHours?.toFixed(2) || '0.00'}</td>
                                        <td>{ts.totalHmHours?.toFixed(2) || '0.00'}</td>
                                        <td>{(ts.totalRespiteHours || 0).toFixed(2)}</td>
                                        <td style={{ fontWeight: 600 }}>{ts.totalHours?.toFixed(2) || '0.00'}</td>
                                        <td>
                                            <span className={`ts-badge ts-badge--${ts.status}`}>{ts.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
