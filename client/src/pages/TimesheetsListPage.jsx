import { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import SearchableSelect from '../components/common/SearchableSelect';
import TimesheetFormPage from './TimesheetFormPage';
import { formatWeek } from '../utils/dates';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton } from '../components/common/ActivityDrawer';

function getSunday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
}

function getCurrentSunday() {
    return getSunday(new Date().toISOString().split('T')[0]);
}

function shiftWeek(sundayStr, offset) {
    const d = new Date(sundayStr + 'T00:00:00');
    d.setDate(d.getDate() + (offset * 7));
    return d.toISOString().split('T')[0];
}

function formatWeekEnding(weekStartStr) {
    const d = new Date(weekStartStr + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TimesheetsListPage() {
    const { isAdmin } = useAuth();
    const { showToast } = useToast();
    const [clients, setClients] = useState([]);
    const [allTimesheets, setAllTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [weekFilter, setWeekFilter] = useState('');
    const [pcaFilter, setPcaFilter] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [activeTimesheetId, setActiveTimesheetId] = useState(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newPcaName, setNewPcaName] = useState('');
    const [newClientId, setNewClientId] = useState('');
    const [newWeekDate, setNewWeekDate] = useState(getSunday(new Date().toISOString().split('T')[0]));
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientIdNumber, setNewClientIdNumber] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(null);
    const [confirmBulkPermanentDelete, setConfirmBulkPermanentDelete] = useState(false);

    useEffect(() => {
        api.getClients().then(setClients).catch(() => {});
    }, []);

    const fetchTimesheets = useCallback(async () => {
        try {
            const parts = [];
            if (weekFilter) parts.push(`weekStart=${weekFilter}`);
            const params = parts.join('&');
            const data = await api.getTimesheets(params, { archived: showArchived });
            setAllTimesheets(data);
        } catch (err) { showToast(err.message, 'error'); }
        setLoading(false);
    }, [weekFilter, showArchived, showToast]);

    useEffect(() => { fetchTimesheets(); }, [fetchTimesheets]);

    const timesheets = useMemo(() => {
        let filtered = allTimesheets;
        if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
        if (pcaFilter) filtered = filtered.filter(t => t.pcaName === pcaFilter);
        if (clientFilter) filtered = filtered.filter(t => t.clientId === Number(clientFilter));
        return filtered;
    }, [allTimesheets, statusFilter, pcaFilter, clientFilter]);

    const statusCounts = useMemo(() => {
        const counts = { total: allTimesheets.length, draft: 0, submitted: 0, accepted: 0, rejected: 0 };
        for (const t of allTimesheets) {
            if (counts[t.status] !== undefined) counts[t.status]++;
        }
        return counts;
    }, [allTimesheets]);

    const pcaNames = useMemo(() => {
        const names = [...new Set(allTimesheets.map(t => t.pcaName).filter(Boolean))];
        return names.sort();
    }, [allTimesheets]);

    const handleReset = () => {
        setStatusFilter('');
        setPcaFilter('');
        setClientFilter('');
        setWeekFilter('');
    };

    const handleCreate = async () => {
        if (!newPcaName.trim() || !newClientId) { showToast('Fill in PCA name and Client', 'error'); return; }
        try {
            const ts = await api.createTimesheet({ pcaName: newPcaName.trim(), clientId: Number(newClientId), weekStart: newWeekDate, clientPhone: newClientPhone.trim(), clientIdNumber: newClientIdNumber.trim() });
            setShowNewModal(false); setNewPcaName(''); setNewClientPhone(''); setNewClientIdNumber('');
            setActiveTimesheetId(ts.id);
            showToast('Timesheet created');
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (ts) => {
        try {
            await api.deleteTimesheet(ts.id);
            setConfirmDelete(null);
            showToast('Timesheet archived');
            fetchTimesheets();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestore = async (id) => {
        try {
            await api.restoreTimesheet(id);
            showToast('Timesheet restored');
            fetchTimesheets();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handlePermanentDelete = async (ts) => {
        try {
            await api.permanentlyDeleteTimesheet(ts.id);
            setConfirmPermanentDelete(null);
            showToast('Timesheet permanently deleted');
            fetchTimesheets();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkPermanentDelete = async () => {
        try {
            const result = await api.bulkPermanentlyDeleteTimesheets();
            setConfirmBulkPermanentDelete(false);
            showToast(`${result.count} archived timesheet(s) permanently deleted`);
            fetchTimesheets();
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (activeTimesheetId) {
        return <TimesheetFormPage timesheetId={activeTimesheetId} clients={clients} onBack={() => { setActiveTimesheetId(null); fetchTimesheets(); }} showToast={showToast} />;
    }

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Timesheets</h1>
                <div className="content-header__actions">
                    {isAdmin && <ActivityButton entityType="Timesheet" />}
                    {!showArchived && (
                        <button className="archive-toggle" onClick={() => setShowArchived(true)}>
                            {Icons.archive} View Archived
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary btn--sm" onClick={() => setShowNewModal(true)}>{Icons.plus} New Timesheet</button>
                    )}
                </div>
            </div>
            <div className="page-content">
                {!showArchived && (
                    <>
                        <div className="ts-filter-bar">
                            <div className="ts-filter-bar__field">
                                <label>Week</label>
                                <div className="ts-filter-bar__week">
                                    <button className="ts-filter-bar__week-btn" onClick={() => setWeekFilter(shiftWeek(weekFilter || getCurrentSunday(), -1))}>
                                        {Icons.chevronLeft}
                                    </button>
                                    <span className="ts-filter-bar__week-label">
                                        {weekFilter ? formatWeek(weekFilter) : 'All Weeks'}
                                    </span>
                                    <button className="ts-filter-bar__week-btn" onClick={() => setWeekFilter(shiftWeek(weekFilter || getCurrentSunday(), 1))}>
                                        {Icons.chevronRight}
                                    </button>
                                </div>
                            </div>
                            <div className="ts-filter-bar__field">
                                <label>Caregiver</label>
                                <select value={pcaFilter} onChange={(e) => setPcaFilter(e.target.value)}>
                                    <option value="">All Caregivers</option>
                                    {pcaNames.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <div className="ts-filter-bar__field">
                                <label>Client</label>
                                <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                                    <option value="">All Clients</option>
                                    {[...clients].sort((a, b) => a.clientName.localeCompare(b.clientName)).map(c => (
                                        <option key={c.id} value={c.id}>{c.clientName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ts-filter-bar__field">
                                <label>Status</label>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                    <option value="">All Status</option>
                                    <option value="draft">Draft</option>
                                    <option value="submitted">Submitted</option>
                                    <option value="accepted">Accepted</option>
                                </select>
                            </div>
                            <div className="ts-filter-bar__actions">
                                <button className="btn btn--outline btn--sm" onClick={handleReset}>Reset</button>
                            </div>
                        </div>

                        <div className="ts-summary-cards">
                            <div className="ts-summary-card">
                                <div className="ts-summary-card__icon ts-summary-card__icon--total">{Icons.fileText}</div>
                                <div className="ts-summary-card__content">
                                    <span className="ts-summary-card__label">Total Timesheets</span>
                                    <span className="ts-summary-card__value">{statusCounts.total}</span>
                                </div>
                            </div>
                            <div className="ts-summary-card">
                                <div className="ts-summary-card__icon ts-summary-card__icon--draft">{Icons.edit}</div>
                                <div className="ts-summary-card__content">
                                    <span className="ts-summary-card__label">Draft</span>
                                    <span className="ts-summary-card__value">{statusCounts.draft}</span>
                                </div>
                            </div>
                            <div className="ts-summary-card">
                                <div className="ts-summary-card__icon ts-summary-card__icon--submitted">{Icons.upload}</div>
                                <div className="ts-summary-card__content">
                                    <span className="ts-summary-card__label">Submitted</span>
                                    <span className="ts-summary-card__value">{statusCounts.submitted}</span>
                                </div>
                            </div>
                            <div className="ts-summary-card">
                                <div className="ts-summary-card__icon ts-summary-card__icon--accepted">{Icons.checkCircle}</div>
                                <div className="ts-summary-card__content">
                                    <span className="ts-summary-card__label">Accepted</span>
                                    <span className="ts-summary-card__value">{statusCounts.accepted}</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived timesheets. Click "Restore" to bring items back.</span>
                        {allTimesheets.length > 0 && (
                            <button className="btn btn--danger btn--sm" onClick={() => setConfirmBulkPermanentDelete(true)}>
                                {Icons.trash} Delete All Archived
                            </button>
                        )}
                        <button className="btn btn--outline btn--sm" onClick={() => setShowArchived(false)}>
                            {Icons.chevronLeft} Back to Active
                        </button>
                    </div>
                )}
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
                ) : timesheets.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.fileText}</div>
                        <div className="empty-state__title">{weekFilter || statusFilter || pcaFilter || clientFilter ? 'No timesheets match your filters' : 'No timesheets yet'}</div>
                        <div className="empty-state__desc">Click &quot;New Timesheet&quot; to create a weekly PCA Service Delivery Record{weekFilter ? ', or adjust your filters' : ''}.</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead><tr>
                                <th>Caregiver</th>
                                <th>Client</th>
                                <th>Week Ending</th>
                                <th>Total Hours</th>
                                <th>PAS Hours</th>
                                <th>HM Hours</th>
                                <th>Respite Hours</th>
                                <th>Status</th>
                                <th>Date Submitted</th>
                                <th style={{ width: showArchived ? 160 : 120 }}>Actions</th>
                            </tr></thead>
                            <tbody>
                                {timesheets.map((ts) => (
                                    <tr key={ts.id} className={`clickable-row${ts.status === 'accepted' ? ' ts-row--accepted' : ''}`} onClick={() => setActiveTimesheetId(ts.id)}>
                                        <td style={{ fontWeight: 500 }}>{ts.pcaName}</td>
                                        <td>{ts.client?.clientName}</td>
                                        <td style={{ fontSize: 13 }}>{formatWeekEnding(ts.weekStart.split('T')[0])}</td>
                                        <td><strong>{ts.totalHours.toFixed(2)}</strong></td>
                                        <td>{ts.totalPasHours.toFixed(2)}</td>
                                        <td>{ts.totalHmHours.toFixed(2)}</td>
                                        <td>{(ts.totalRespiteHours || 0).toFixed(2)}</td>
                                        <td><span className={`ts-badge ts-badge--${ts.status}`}>{ts.status}</span></td>
                                        <td style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                                            {ts.submittedAt ? new Date(ts.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            {showArchived ? (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn--restore btn--xs" onClick={() => handleRestore(ts.id)} title="Restore">{Icons.rotateCcw}</button>
                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setConfirmPermanentDelete(ts)} title="Delete permanently">{Icons.trash}</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <button className="btn btn--outline btn--xs" onClick={() => setActiveTimesheetId(ts.id)}>Open</button>
                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setConfirmDelete(ts)} title="Archive">{Icons.trash}</button>
                                                </div>
                                            )}
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
                        <SearchableSelect
                            options={[...clients].sort((a, b) => a.clientName.localeCompare(b.clientName)).map(c => ({ value: c.id, label: c.clientName }))}
                            value={newClientId}
                            onChange={setNewClientId}
                            placeholder="Search clients…"
                        />
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
            {confirmDelete && (
                <ConfirmModal
                    title="Archive Timesheet"
                    message={`Archive the timesheet for ${confirmDelete.pcaName} — ${confirmDelete.client?.clientName || 'Unknown'}?`}
                    confirmLabel="Archive"
                    confirmVariant="danger"
                    onConfirm={() => handleDelete(confirmDelete)}
                    onClose={() => setConfirmDelete(null)}
                />
            )}
            {confirmPermanentDelete && (
                <ConfirmModal
                    title="Permanently Delete Timesheet"
                    message={`Permanently delete the timesheet for ${confirmPermanentDelete.pcaName} — ${confirmPermanentDelete.client?.clientName || 'Unknown'}? This action cannot be undone.`}
                    confirmLabel="Delete Forever"
                    confirmVariant="danger"
                    onConfirm={() => handlePermanentDelete(confirmPermanentDelete)}
                    onClose={() => setConfirmPermanentDelete(null)}
                />
            )}
            {confirmBulkPermanentDelete && (
                <ConfirmModal
                    title="Delete All Archived Timesheets"
                    message={`Permanently delete all ${allTimesheets.length} archived timesheet(s)? This action cannot be undone.`}
                    confirmLabel="Delete All Forever"
                    confirmVariant="danger"
                    onConfirm={handleBulkPermanentDelete}
                    onClose={() => setConfirmBulkPermanentDelete(false)}
                />
            )}
        </>
    );
}
