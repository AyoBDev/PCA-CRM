import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import LoadingState from '../components/common/LoadingState';

function getSunday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - dt.getDay());
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function toDateOnly(isoOrDateStr) {
    if (!isoOrDateStr) return '';
    return isoOrDateStr.split('T')[0];
}

function formatWeekEnding(weekStartStr) {
    const ds = toDateOnly(weekStartStr);
    const [y, m, d] = ds.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 6);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TimesheetsListPage() {
    const { isAdmin } = useAuth();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [clients, setClients] = useState([]);
    const [allTimesheets, setAllTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [pcaFilter, setPcaFilter] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [serviceFilter, setServiceFilter] = useState('');
    const openParam = searchParams.get('open');
    const [activeTimesheetId, setActiveTimesheetId] = useState(openParam ? Number(openParam) : null);
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
            const data = await api.getTimesheets('', { archived: showArchived });
            setAllTimesheets(data);
        } catch (err) { showToast(err.message, 'error'); }
        setLoading(false);
    }, [showArchived, showToast]);

    useEffect(() => { fetchTimesheets(); }, [fetchTimesheets]);

    const timesheets = useMemo(() => {
        let filtered = allTimesheets;
        if (statusFilter === 'overdue') filtered = filtered.filter(t => t.isOverdue);
        else if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
        if (pcaFilter) filtered = filtered.filter(t => t.pcaName === pcaFilter);
        if (clientFilter) filtered = filtered.filter(t => t.clientId === Number(clientFilter));
        if (dateFrom) {
            filtered = filtered.filter(t => toDateOnly(t.weekStart) >= dateFrom);
        }
        if (dateTo) {
            const toSunday = getSunday(dateTo);
            filtered = filtered.filter(t => toDateOnly(t.weekStart) <= toSunday);
        }
        if (serviceFilter) {
            filtered = filtered.filter(t => {
                if (serviceFilter === 'PAS') return t.totalPasHours > 0;
                if (serviceFilter === 'Homemaker') return t.totalHmHours > 0;
                if (serviceFilter === 'Respite') return (t.totalRespiteHours || 0) > 0;
                return true;
            });
        }
        return filtered;
    }, [allTimesheets, statusFilter, pcaFilter, clientFilter, dateFrom, dateTo, serviceFilter]);

    const statusCounts = useMemo(() => {
        const counts = { total: allTimesheets.length, draft: 0, submitted: 0, accepted: 0, overdue: 0 };
        for (const t of allTimesheets) {
            if (counts[t.status] !== undefined) counts[t.status]++;
            if (t.isOverdue) counts.overdue++;
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
        setDateFrom('');
        setDateTo('');
        setServiceFilter('');
    };

    const handleSearch = () => {
        fetchTimesheets();
    };

    const [selectedIds, setSelectedIds] = useState(new Set());

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === timesheets.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(timesheets.map(t => t.id)));
        }
    };

    const handleExportExcel = () => {
        const toExport = selectedIds.size > 0 ? timesheets.filter(t => selectedIds.has(t.id)) : timesheets;
        if (toExport.length === 0) { showToast('No timesheets to export', 'error'); return; }
        const headers = ['Caregiver', 'Client', 'Week Ending', 'Total Hours', 'PAS Hours', 'HM Hours', 'Respite Hours', 'Status', 'Date Submitted'];
        const rows = toExport.map(ts => [
            ts.pcaName,
            ts.client?.clientName || '',
            formatWeekEnding(ts.weekStart),
            ts.totalHours.toFixed(2),
            ts.totalPasHours.toFixed(2),
            ts.totalHmHours.toFixed(2),
            (ts.totalRespiteHours || 0).toFixed(2),
            ts.status,
            ts.submittedAt ? new Date(ts.submittedAt).toLocaleDateString() : '',
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `timesheets-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${toExport.length} timesheet(s) to CSV`);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleSendSharedLink = async () => {
        if (selectedIds.size === 0) { showToast('Select at least one timesheet to send a shared link', 'error'); return; }
        const selected = timesheets.filter(t => selectedIds.has(t.id));
        const linksGenerated = [];
        for (const ts of selected) {
            if (!ts.clientId) continue;
            try {
                const link = await api.createPermanentLink({ clientId: ts.clientId, pcaName: ts.pcaName });
                linksGenerated.push(link);
            } catch (err) {
                // Link may already exist — that's OK
            }
        }
        if (linksGenerated.length > 0) {
            const baseUrl = window.location.origin;
            const urls = linksGenerated.map(l => `${baseUrl}/pca-form/${l.token}`);
            await navigator.clipboard.writeText(urls.join('\n'));
            showToast(`${linksGenerated.length} shared link(s) copied to clipboard`);
        } else {
            showToast('Links already exist for selected timesheets — check Permanent Links page', 'info');
        }
        setSelectedIds(new Set());
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
        return <TimesheetFormPage timesheetId={activeTimesheetId} clients={clients} onBack={() => { setActiveTimesheetId(null); setSearchParams({}); fetchTimesheets(); }} showToast={showToast} />;
    }

    return (
        <>
            <div className="page-hero">
                <div className="page-hero__left">
                    <div className="page-hero__icon">{Icons.clipboard}</div>
                    <div>
                        <div className="page-hero__title">Timesheets</div>
                        <div className="page-hero__subtitle">Track and manage weekly service records</div>
                    </div>
                </div>
                <div className="page-hero__right">
                    {isAdmin && <ActivityButton entityType="Timesheet" />}
                    {!showArchived && (
                        <button className="btn btn--outline" onClick={() => setShowArchived(true)}>
                            {Icons.archive} Archived
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary" onClick={() => setShowNewModal(true)}>{Icons.plus} New Timesheet</button>
                    )}
                </div>
            </div>
            <div className="page-content">
                {!showArchived && (
                    <>
                        <div className="ts-filter-bar">
                            <div className="ts-filter-bar__field">
                                <label>Week</label>
                                <div className="ts-filter-bar__date-range">
                                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
                                    <span className="ts-filter-bar__date-sep">–</span>
                                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
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
                                <label>Service Type</label>
                                <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                                    <option value="">All Services</option>
                                    <option value="PAS">PAS</option>
                                    <option value="Homemaker">Homemaker</option>
                                    <option value="Respite">Respite</option>
                                </select>
                            </div>
                            <div className="ts-filter-bar__field">
                                <label>Status</label>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                    <option value="">All Status</option>
                                    <option value="draft">Draft</option>
                                    <option value="submitted">Submitted</option>
                                    <option value="accepted">Accepted</option>
                                    <option value="overdue">Overdue</option>
                                </select>
                            </div>
                            <div className="ts-filter-bar__actions">
                                <button className="btn btn--outline btn--sm" onClick={handleReset}>Reset</button>
                                <button className="btn btn--primary btn--sm" onClick={handleSearch}>{Icons.search} Search</button>
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
                            <div className="ts-summary-card">
                                <div className="ts-summary-card__icon ts-summary-card__icon--overdue">{Icons.alertCircle}</div>
                                <div className="ts-summary-card__content">
                                    <span className="ts-summary-card__label">Overdue</span>
                                    <span className="ts-summary-card__value">{statusCounts.overdue}</span>
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
                    <LoadingState rows={5} />
                ) : timesheets.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.fileText}</div>
                        <div className="empty-state__title">{dateFrom || dateTo || statusFilter || pcaFilter || clientFilter || serviceFilter ? 'No timesheets match your filters' : 'No timesheets yet'}</div>
                        <div className="empty-state__desc">Click &quot;New Timesheet&quot; to create a weekly PCA Service Delivery Record, or adjust your filters.</div>
                    </div>
                ) : (
                    <>
                        <div className="sheet-card">
                          <div className="table-scroll">
                            <table className="data-table data-table--sheet data-table--dark-header">
                                <thead><tr>
                                    {!showArchived && (
                                        <th scope="col" style={{ width: 36 }}>
                                            <input type="checkbox" checked={selectedIds.size === timesheets.length && timesheets.length > 0} onChange={toggleSelectAll} />
                                        </th>
                                    )}
                                    <th scope="col">Caregiver</th>
                                    <th scope="col">Client</th>
                                    <th scope="col">Week Ending</th>
                                    <th scope="col">Total Hours</th>
                                    <th scope="col">PAS Hours</th>
                                    <th scope="col">HM Hours</th>
                                    <th scope="col">Respite Hours</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Date Submitted</th>
                                    <th scope="col" style={{ width: showArchived ? 160 : 120 }}>Actions</th>
                                </tr></thead>
                                <tbody>
                                    {timesheets.map((ts) => (
                                        <tr key={ts.id} className={`clickable-row${ts.status === 'accepted' ? ' ts-row--accepted' : ''}`} onClick={() => setActiveTimesheetId(ts.id)}>
                                            {!showArchived && (
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedIds.has(ts.id)} onChange={() => toggleSelect(ts.id)} />
                                                </td>
                                            )}
                                            <td style={{ fontWeight: 500 }}>{ts.pcaName}</td>
                                            <td>{ts.client?.clientName}</td>
                                            <td style={{ fontSize: 13 }}>{formatWeekEnding(ts.weekStart)}</td>
                                            <td><strong>{ts.totalHours.toFixed(2)}</strong></td>
                                            <td>{ts.totalPasHours.toFixed(2)}</td>
                                            <td>{ts.totalHmHours.toFixed(2)}</td>
                                            <td>{(ts.totalRespiteHours || 0).toFixed(2)}</td>
                                            <td><span className={`ts-badge ${ts.isOverdue ? 'ts-badge--overdue' : `ts-badge--${ts.status}`}`}>{ts.isOverdue ? 'Overdue' : ts.status}</span></td>
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
                        </div>
                        {!showArchived && (
                            <div className="ts-bottom-actions">
                                {selectedIds.size > 0 && (
                                    <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{selectedIds.size} selected</span>
                                )}
                                <button className="btn btn--primary btn--sm" onClick={handleSendSharedLink}>{Icons.share} Send Shared Link{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</button>
                                <button className="btn btn--success btn--sm" onClick={handleExportExcel}>{Icons.download} Export to Excel</button>
                                <button className="btn btn--outline btn--sm" onClick={handlePrint}>{Icons.fileText} Print</button>
                            </div>
                        )}
                    </>
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
