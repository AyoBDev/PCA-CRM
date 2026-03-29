import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../../api';

export default function ScheduleConfirmPage() {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        api.getScheduleConfirm(token)
            .then(res => {
                setData(res);
                setConfirmed(!!res.confirmed);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            await api.confirmSchedule(token);
            setConfirmed(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setConfirming(false);
        }
    };

    if (loading) return <div className="signing-page"><p>Loading schedule...</p></div>;
    if (error) return <div className="signing-page"><p className="error">{error}</p></div>;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="signing-page">
            <div className="signing-card" style={{ maxWidth: 700 }}>
                <h2>Schedule for {data.employee.name}</h2>
                <p>Week of {data.weekStart} to {data.weekEnd}</p>

                <table className="data-table" style={{ marginTop: 16 }}>
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Time</th>
                            <th>Client</th>
                            <th>Address</th>
                            <th>Phone</th>
                            <th>Gate Code</th>
                            <th>Service</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.shifts.map(shift => {
                            const d = new Date(shift.shiftDate);
                            return (
                                <tr key={shift.id}>
                                    <td>{dayNames[d.getUTCDay()]} {d.getUTCMonth()+1}/{d.getUTCDate()}</td>
                                    <td>{shift.startTime} - {shift.endTime}</td>
                                    <td>{shift.client.clientName}</td>
                                    <td>{shift.client.address || '—'}</td>
                                    <td>{shift.client.phone || '—'}</td>
                                    <td>{shift.client.gateCode || '—'}</td>
                                    <td>{shift.serviceCode}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {confirmed ? (
                    <div className="signing-success" style={{ marginTop: 24 }}>
                        Schedule confirmed. Thank you!
                    </div>
                ) : (
                    <button
                        className="btn btn--primary"
                        style={{ marginTop: 24, width: '100%' }}
                        onClick={handleConfirm}
                        disabled={confirming}
                    >
                        {confirming ? 'Confirming...' : 'I confirm I have received this schedule'}
                    </button>
                )}
            </div>
        </div>
    );
}
