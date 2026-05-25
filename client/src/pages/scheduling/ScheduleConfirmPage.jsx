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
    const [selectedResponse, setSelectedResponse] = useState(null);

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

                <div className="table-scroll" style={{ marginTop: 8 }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th scope="col">Day</th>
                            <th scope="col">Time</th>
                            <th scope="col">Client</th>
                            <th scope="col">Address</th>
                            <th scope="col">Phone</th>
                            <th scope="col">Service</th>
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
                </div>

                {responded ? (
                    <div style={{ marginTop: 24, padding: 16, borderRadius: 8, textAlign: 'center', background: responded === 'accepted' ? '#dcfce7' : '#fef3c7' }}>
                        <p style={{ fontWeight: 600, margin: 0, color: responded === 'accepted' ? '#166534' : '#92400e' }}>
                            {responded === 'accepted' && 'Schedule Accepted. Thank you!'}
                            {responded === 'changes_requested' && 'Revision Request Sent. Your scheduler will review your notes.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ marginTop: 24 }}>
                        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Please select your schedule status:</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, border: `2px solid ${selectedResponse === 'accepted' ? '#22c55e' : '#e5e7eb'}`, background: selectedResponse === 'accepted' ? '#f0fdf4' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                                <input type="radio" name="scheduleResponse" value="accepted" checked={selectedResponse === 'accepted'} onChange={() => setSelectedResponse('accepted')} style={{ width: 18, height: 18, accentColor: '#22c55e' }} />
                                <span style={{ fontWeight: 500, fontSize: 14 }}>Accept Schedule</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, border: `2px solid ${selectedResponse === 'changes_requested' ? '#f59e0b' : '#e5e7eb'}`, background: selectedResponse === 'changes_requested' ? '#fffbeb' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                                <input type="radio" name="scheduleResponse" value="changes_requested" checked={selectedResponse === 'changes_requested'} onChange={() => setSelectedResponse('changes_requested')} style={{ width: 18, height: 18, accentColor: '#f59e0b' }} />
                                <span style={{ fontWeight: 500, fontSize: 14 }}>Request Revisions</span>
                            </label>
                        </div>

                        {selectedResponse === 'changes_requested' && (
                            <div style={{ marginTop: 12 }}>
                                <label style={{ display: 'block', fontWeight: 500, marginBottom: 6, fontSize: 13, color: '#374151' }}>
                                    Please explain what changes you need: <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Describe the revisions needed (e.g., time conflicts, day changes, client preferences)..."
                                    rows={4}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical' }}
                                    required
                                />
                            </div>
                        )}

                        {selectedResponse && (
                            <button
                                className="btn btn--primary"
                                style={{ marginTop: 16, width: '100%', padding: '12px 20px', fontSize: 14 }}
                                onClick={() => handleRespond(selectedResponse)}
                                disabled={submitting || (selectedResponse === 'changes_requested' && !notes.trim())}
                            >
                                {submitting ? 'Submitting...' : selectedResponse === 'accepted' ? 'Confirm Acceptance' : 'Submit Revision Request'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
