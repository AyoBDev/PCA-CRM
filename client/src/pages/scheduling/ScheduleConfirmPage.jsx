import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../../api';

export default function ScheduleConfirmPage() {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [responded, setResponded] = useState(null);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        api.getScheduleConfirm(token)
            .then(res => {
                setData(res);
                if (res.confirmed) setResponded('accepted');
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const handleRespond = async (response) => {
        if (response === 'changes_requested' && !notes.trim()) return;
        setSubmitting(true);
        try {
            await api.respondToSchedule(token, response, notes.trim());
            setResponded(response);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="signing-page"><p>Loading schedule...</p></div>;
    if (error) return <div className="signing-page"><p className="error">{error}</p></div>;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="signing-page">
            <div className="signing-card" style={{ maxWidth: 750 }}>
                <h2 style={{ marginBottom: 4 }}>Schedule for {data.employee.name}</h2>
                <p style={{ color: '#6b7280', margin: '0 0 16px' }}>Week of {data.weekStart} to {data.weekEnd}</p>

                <table className="data-table" style={{ marginTop: 8, fontSize: 13 }}>
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Time</th>
                            <th>Client</th>
                            <th>Address</th>
                            <th>Phone</th>
                            <th>Service</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.shifts.map(shift => {
                            const d = new Date(shift.shiftDate);
                            return (
                                <tr key={shift.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{dayNames[d.getUTCDay()]} {d.getUTCMonth()+1}/{d.getUTCDate()}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{shift.startTime} - {shift.endTime}</td>
                                    <td>{shift.client.clientName}</td>
                                    <td style={{ fontSize: 12 }}>{shift.client.address || '—'}</td>
                                    <td>{shift.client.phone || '—'}</td>
                                    <td>{shift.serviceCode}</td>
                                </tr>
                            );
                        })}
                        {data.shifts.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af' }}>No shifts scheduled this week</td></tr>
                        )}
                    </tbody>
                </table>

                {responded ? (
                    <div style={{ marginTop: 24, padding: 16, borderRadius: 8, textAlign: 'center', background: responded === 'accepted' ? '#dcfce7' : responded === 'rejected' ? '#fee2e2' : '#fef3c7' }}>
                        <p style={{ fontWeight: 600, margin: 0, color: responded === 'accepted' ? '#166534' : responded === 'rejected' ? '#991b1b' : '#92400e' }}>
                            {responded === 'accepted' && 'Schedule Accepted. Thank you!'}
                            {responded === 'rejected' && 'Schedule Rejected. Your scheduler has been notified.'}
                            {responded === 'changes_requested' && 'Change Request Sent. Your scheduler will review your notes.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ marginTop: 24 }}>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontWeight: 500, marginBottom: 6, fontSize: 13 }}>
                                Notes / Requested Changes (optional for accept, required for changes)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Any concerns, conflicts, or requested changes..."
                                rows={3}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                className="btn btn--primary"
                                style={{ flex: 1, padding: '12px 20px' }}
                                onClick={() => handleRespond('accepted')}
                                disabled={submitting}
                            >
                                Accept Schedule
                            </button>
                            <button
                                className="btn"
                                style={{ flex: 1, padding: '12px 20px', background: '#fbbf24', color: '#78350f', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}
                                onClick={() => handleRespond('changes_requested')}
                                disabled={submitting || !notes.trim()}
                                title={!notes.trim() ? 'Please add notes describing the changes you need' : ''}
                            >
                                Request Changes
                            </button>
                            <button
                                className="btn"
                                style={{ flex: 1, padding: '12px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' }}
                                onClick={() => handleRespond('rejected')}
                                disabled={submitting}
                            >
                                Reject Schedule
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
