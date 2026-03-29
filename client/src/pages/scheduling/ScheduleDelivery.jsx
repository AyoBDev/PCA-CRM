import { useState, useEffect } from 'react';
import * as api from '../../api';

export default function ScheduleDelivery({ weekStart }) {
    const [status, setStatus] = useState([]);
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getNotificationStatus(weekStart)
            .then(setStatus)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [weekStart]);

    const handleSend = async () => {
        setSending(true);
        try {
            await api.sendScheduleNotifications({ weekStart });
            // Refresh status
            const updated = await api.getNotificationStatus(weekStart);
            setStatus(updated);
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    // Group notifications by employee
    const byEmployee = new Map();
    for (const n of status) {
        const key = n.employeeId;
        if (!byEmployee.has(key)) {
            byEmployee.set(key, { name: n.employee.name, notifications: [] });
        }
        byEmployee.get(key).notifications.push(n);
    }

    const statusIcon = (s) => {
        switch (s) {
            case 'confirmed': return '\u2713';
            case 'sent': return '\u2192';
            case 'failed': return '\u2717';
            default: return '\u2026';
        }
    };

    const statusColor = (s) => {
        switch (s) {
            case 'confirmed': return '#22c55e';
            case 'sent': return '#3b82f6';
            case 'failed': return '#ef4444';
            default: return '#9ca3af';
        }
    };

    return (
        <div className="sched-card" style={{ marginTop: 16 }}>
            <div className="sched-card__header">
                <div className="sched-card__header-left">
                    <div className="sched-card__header-title">Schedule Delivery</div>
                </div>
                <div className="sched-card__header-actions">
                    <button className="btn btn--primary btn--sm" onClick={handleSend} disabled={sending}>
                        {sending ? 'Sending...' : 'Send Schedules'}
                    </button>
                </div>
            </div>
            <div className="sched-card__body">
                {loading ? (
                    <p>Loading status...</p>
                ) : byEmployee.size === 0 ? (
                    <p style={{ color: '#71717a' }}>No schedules sent for this week yet.</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr><th>Employee</th><th>Method</th><th>Status</th><th>Sent</th><th>Confirmed</th></tr>
                        </thead>
                        <tbody>
                            {[...byEmployee.entries()].map(([empId, { name, notifications }]) =>
                                notifications.map((n, i) => (
                                    <tr key={n.id}>
                                        {i === 0 && <td rowSpan={notifications.length}>{name}</td>}
                                        <td>{n.method}</td>
                                        <td style={{ color: statusColor(n.status) }}>
                                            {statusIcon(n.status)} {n.status}
                                        </td>
                                        <td>{n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}</td>
                                        <td>{n.confirmedAt ? new Date(n.confirmedAt).toLocaleString() : '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
