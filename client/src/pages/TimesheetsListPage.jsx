import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import TimesheetFormPage from './TimesheetFormPage';
import { formatWeek } from '../utils/dates';
import { useToast } from '../hooks/useToast';

function getSunday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
}

export default function TimesheetsListPage() {
    const { showToast } = useToast();
    const [clients, setClients] = useState([]);
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [activeTimesheetId, setActiveTimesheetId] = useState(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newPcaName, setNewPcaName] = useState('');
    const [newClientId, setNewClientId] = useState('');
    const [newWeekDate, setNewWeekDate] = useState(getSunday(new Date().toISOString().split('T')[0]));
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientIdNumber, setNewClientIdNumber] = useState('');

    useEffect(() => {
        api.getClients().then(setClients).catch(() => {});
    }, []);

    const fetchTimesheets = useCallback(async () => {
        try {
            const params = statusFilter ? `status=${statusFilter}` : '';
            const data = await api.getTimesheets(params);
            setTimesheets(data);
        } catch (err) { showToast(err.message, 'error'); }
        setLoading(false);
    }, [statusFilter, showToast]);

    useEffect(() => { fetchTimesheets(); }, [fetchTimesheets]);

    const handleCreate = async () => {
        if (!newPcaName.trim() || !newClientId) { showToast('Fill in PCA name and Client', 'error'); return; }
        try {
            const ts = await api.createTimesheet({ pcaName: newPcaName.trim(), clientId: Number(newClientId), weekStart: newWeekDate, clientPhone: newClientPhone.trim(), clientIdNumber: newClientIdNumber.trim() });
            setShowNewModal(false); setNewPcaName(''); setNewClientPhone(''); setNewClientIdNumber('');
            setActiveTimesheetId(ts.id);
            showToast('Timesheet created');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (id) => {
        try { await api.deleteTimesheet(id); showToast('Timesheet deleted'); fetchTimesheets(); } catch (err) { showToast(err.message, 'error'); }
    };

    if (activeTimesheetId) {
        return <TimesheetFormPage timesheetId={activeTimesheetId} clients={clients} onBack={() => { setActiveTimesheetId(null); fetchTimesheets(); }} showToast={showToast} />;
    }

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Timesheets</h1>
                <div className="content-header__actions">
                    <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ marginRight: 8 }}>
                        <option value="">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                    </select>
                    <button className="btn btn--primary btn--sm" onClick={() => setShowNewModal(true)}>{Icons.plus} New Timesheet</button>
                </div>
            </div>
            <div className="page-content">
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
                ) : timesheets.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.fileText}</div>
                        <div className="empty-state__title">No timesheets yet</div>
                        <div className="empty-state__desc">Click &quot;New Timesheet&quot; to create a weekly PCA Service Delivery Record.</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead><tr><th>PCA Name</th><th>Client</th><th>Week</th><th>PAS Hrs</th><th>HM Hrs</th><th>Respite Hrs</th><th>Total</th><th>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
                            <tbody>
                                {timesheets.map((ts) => (
                                    <tr key={ts.id} className="clickable-row" onClick={() => setActiveTimesheetId(ts.id)}>
                                        <td style={{ fontWeight: 500 }}>{ts.pcaName}</td>
                                        <td>{ts.client?.clientName}</td>
                                        <td style={{ fontSize: 13 }}>{formatWeek(ts.weekStart.split('T')[0])}</td>
                                        <td>{ts.totalPasHours.toFixed(2)}</td>
                                        <td>{ts.totalHmHours.toFixed(2)}</td>
                                        <td>{(ts.totalRespiteHours || 0).toFixed(2)}</td>
                                        <td><strong>{ts.totalHours.toFixed(2)}</strong></td>
                                        <td><span className={`ts-badge ts-badge--${ts.status}`}>{ts.status}</span></td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <button className="btn btn--danger-ghost btn--icon" onClick={() => handleDelete(ts.id)} title="Delete">{Icons.trash}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {showNewModal && (
                <Modal onClose={() => setShowNewModal(false)}>
                    <h2 className="modal__title">New Service Delivery Record</h2>
                    <p className="modal__desc">Create a weekly PCA timesheet (Sunday–Saturday).</p>
                    <div className="form-group"><label>PCA Name</label><input type="text" value={newPcaName} onChange={(e) => setNewPcaName(e.target.value)} placeholder="Jane Smith" autoFocus /></div>
                    <div className="form-group">
                        <label>Client</label>
                        <select value={newClientId} onChange={(e) => setNewClientId(e.target.value)}>
                            <option value="">Select a client…</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group"><label>Client Phone</label><input type="tel" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} placeholder="702-555-0123" /></div>
                        <div className="form-group"><label>Client ID #</label><input type="text" value={newClientIdNumber} onChange={(e) => setNewClientIdNumber(e.target.value)} placeholder="Optional" /></div>
                    </div>
                    <div className="form-group"><label>Week Starting (Sunday)</label><input type="date" value={newWeekDate} onChange={(e) => setNewWeekDate(getSunday(e.target.value))} /></div>
                    <div className="form-actions">
                        <button type="button" className="btn btn--outline" onClick={() => setShowNewModal(false)}>Cancel</button>
                        <button type="button" className="btn btn--primary" onClick={handleCreate}>Create Timesheet</button>
                    </div>
                </Modal>
            )}
        </>
    );
}
