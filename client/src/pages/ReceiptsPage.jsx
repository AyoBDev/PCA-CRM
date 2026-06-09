import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import { useToast } from '../hooks/useToast';
import { useUndoStack } from '../hooks/useUndoStack';
import Modal from '../components/common/Modal';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';

function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtMoney(n) {
    const abs = Math.abs(Number(n));
    const formatted = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n) < 0 ? `-${formatted}` : formatted;
}

function snapToSunday(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export default function ReceiptsPage() {
    const { showToast } = useToast();
    const undoState = useUndoStack();
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showGenerate, setShowGenerate] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    const fetchReceipts = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            if (search.trim()) params.search = search.trim();
            const data = await api.getReceipts(params);
            setReceipts(data);
        } catch (err) {
            showToast('Failed to load receipts', 'error');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, search, showToast]);

    useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

    const handleFinalize = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        try {
            await api.finalizeReceipts(ids);
            showToast(`${ids.length} receipt(s) finalized`, 'success');
            setSelectedIds(new Set());
            fetchReceipts();
            undoState.pushAction(`Finalized ${ids.length} receipt(s)`,
                async () => { /* finalize cannot be easily reversed */ fetchReceipts(); },
                async () => { await api.finalizeReceipts(ids); fetchReceipts(); }
            );
        } catch (err) {
            showToast('Failed to finalize', 'error');
        }
    };

    const handleSend = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        try {
            const results = await api.sendReceipts(ids);
            const sent = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            showToast(`${sent} sent${failed ? `, ${failed} failed` : ''}`, sent > 0 ? 'success' : 'error');
            setSelectedIds(new Set());
            fetchReceipts();
        } catch (err) {
            showToast('Failed to send', 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const statusBadge = (status) => {
        const colors = { draft: 'ts-badge--draft', finalized: 'ts-badge--submitted', sent: 'ts-badge--accepted' };
        return <span className={`ts-badge ${colors[status] || ''}`}>{status}</span>;
    };

    return (
        <>
            <GlobalToolbar
                title="Receipts"
                subtitle="Pay stubs for bi-weekly periods"
                icon={Icons.dollarSign}
                activityEntity="Receipt"
                undoState={undoState}
            />
            <ContextBar>
                <ContextBar.Left>
                    <input className="context-bar__search" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
                    {['all', 'draft', 'finalized', 'sent'].map(f => (
                        <button key={f} className={`filter-btn ${statusFilter === f ? 'filter-btn--active' : ''}`} onClick={() => setStatusFilter(f)}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </ContextBar.Left>
                <ContextBar.Right>
                    <button className="btn btn--primary" onClick={() => setShowGenerate(true)}>{Icons.plus} Generate Receipts</button>
                </ContextBar.Right>
            </ContextBar>

            {selectedIds.size > 0 && (
                <div className="table-toolbar">
                    <div className="table-toolbar__left">
                        <span className="table-toolbar__selected">{selectedIds.size} selected</span>
                        <button className="btn btn--outline btn--sm" onClick={handleFinalize}>Finalize</button>
                        <button className="btn btn--primary btn--sm" onClick={handleSend}>Send</button>
                    </div>
                </div>
            )}

            <div className="sheet-card">
                <div className="table-scroll">
                    <table className="data-table data-table--dark-header">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th>Employee</th>
                                <th>Period</th>
                                <th>Gross</th>
                                <th>Deductions</th>
                                <th>Net Pay</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>Loading...</td></tr>}
                            {!loading && receipts.length === 0 && (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>No receipts found</td></tr>
                            )}
                            {receipts.map(r => (
                                <tr key={r.id}>
                                    <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                                    <td style={{ fontWeight: 500 }}>{r.employee?.name}</td>
                                    <td>{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</td>
                                    <td>{fmtMoney(r.grossEarnings)}</td>
                                    <td>{fmtMoney(r.garnishment + r.childSupport + r.overpaymentDeduction + r.otherDeductions)}</td>
                                    <td style={{ fontWeight: 600 }}>{fmtMoney(r.netPay)}</td>
                                    <td>{statusBadge(r.status)}</td>
                                    <td>
                                        <button className="btn btn--ghost btn--xs" title="Download PDF" onClick={async () => {
                                            const blob = await api.downloadReceiptPdf(r.id);
                                            const url = URL.createObjectURL(blob);
                                            window.open(url, '_blank');
                                        }}>
                                            {Icons.download}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showGenerate && <GenerateReceiptsModal onClose={() => { setShowGenerate(false); fetchReceipts(); }} />}
        </>
    );
}

function GenerateReceiptsModal({ onClose }) {
    const { showToast } = useToast();
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [payDate, setPayDate] = useState('');
    const [previews, setPreviews] = useState([]);
    const [overrides, setOverrides] = useState({});
    const [sendOnGenerate, setSendOnGenerate] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [previewLoaded, setPreviewLoaded] = useState(false);

    const handlePeriodChange = (val) => {
        const sunday = snapToSunday(val);
        setPeriodStart(sunday);
        setPeriodEnd(addDays(sunday, 13));
    };

    const handlePreview = async () => {
        if (!periodStart || !periodEnd) return;
        try {
            const data = await api.previewReceipts({ periodStart, periodEnd });
            setPreviews(data);
            setPreviewLoaded(true);
        } catch (err) {
            showToast('Failed to load preview', 'error');
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const receiptInputs = previews.map(p => ({
                employeeId: p.employeeId,
                totalHours: overrides[p.employeeId]?.totalHours ?? p.totalHours,
                week1Hours: overrides[p.employeeId]?.week1Hours ?? p.week1Hours ?? 0,
                week2Hours: overrides[p.employeeId]?.week2Hours ?? p.week2Hours ?? 0,
                hourlyRate: overrides[p.employeeId]?.hourlyRate ?? p.hourlyRate,
                overpaymentDeduction: overrides[p.employeeId]?.overpaymentDeduction ?? (p.overpaymentBalance > 0 ? p.overpaymentBalance : 0),
                otherDeductions: overrides[p.employeeId]?.otherDeductions ?? 0,
                notes: overrides[p.employeeId]?.notes ?? '',
            }));
            await api.generateReceipts({
                periodStart,
                periodEnd,
                payDate,
                receipts: receiptInputs,
                sendEmail: sendOnGenerate,
            });
            showToast(`${receiptInputs.length} receipt(s) generated${sendOnGenerate ? ' and sent' : ''}`, 'success');
            onClose();
        } catch (err) {
            showToast('Failed to generate', 'error');
        } finally {
            setGenerating(false);
        }
    };

    const updateOverride = (employeeId, field, value) => {
        setOverrides(prev => ({
            ...prev,
            [employeeId]: { ...prev[employeeId], [field]: value },
        }));
    };

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">Generate Receipts</h2>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                    <label>Period Start (Sunday)</label>
                    <input type="date" value={periodStart} onChange={e => handlePeriodChange(e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Period End (Saturday)</label>
                    <input type="date" value={periodEnd} disabled />
                </div>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                    <label>Pay Date</label>
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn btn--outline" onClick={handlePreview} disabled={!periodStart}>Preview Employees</button>
                </div>
            </div>

            {previewLoaded && previews.length === 0 && (
                <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13, marginTop: 8 }}>
                    No employees have a payroll profile. Go to an employee's Payroll tab to set one up first.
                </p>
            )}

            {previews.length > 0 && (
                <>
                    <div className="table-scroll" style={{ maxHeight: 400, marginBottom: 16 }}>
                        <table className="data-table data-table--compact">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Week 1 Hrs</th>
                                    <th>Week 2 Hrs</th>
                                    <th>Total</th>
                                    <th>Rate</th>
                                    <th>Gross</th>
                                    <th>Deductions</th>
                                    <th>Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previews.map(p => {
                                    const w1 = overrides[p.employeeId]?.week1Hours ?? p.week1Hours ?? 0;
                                    const w2 = overrides[p.employeeId]?.week2Hours ?? p.week2Hours ?? 0;
                                    const total = overrides[p.employeeId]?.totalHours ?? p.totalHours;
                                    const gross = total * (p.hourlyRate || 0);
                                    const deductions = p.garnishment + p.childSupport + p.overpaymentDeduction + p.otherDeductions;
                                    return (
                                        <tr key={p.employeeId}>
                                            <td style={{ fontWeight: 500 }}>
                                                {p.employeeName}
                                                {!p.hasEmail && <span style={{ color: 'hsl(var(--warning))', fontSize: 11, marginLeft: 6 }}>No email</span>}
                                                {p.overpaymentBalance > 0 && <span style={{ color: 'hsl(var(--destructive))', fontSize: 11, marginLeft: 6 }}>Owes {fmtMoney(p.overpaymentBalance)}</span>}
                                            </td>
                                            <td>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <input type="number" step="0.25" value={w1} onChange={e => {
                                                        const val = Number(e.target.value);
                                                        updateOverride(p.employeeId, 'week1Hours', val);
                                                        updateOverride(p.employeeId, 'totalHours', val + w2);
                                                    }} style={{ width: 70 }} />
                                                </div>
                                            </td>
                                            <td>
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <input type="number" step="0.25" value={w2} onChange={e => {
                                                        const val = Number(e.target.value);
                                                        updateOverride(p.employeeId, 'week2Hours', val);
                                                        updateOverride(p.employeeId, 'totalHours', w1 + val);
                                                    }} style={{ width: 70 }} />
                                                </div>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{total}</td>
                                            <td>{fmtMoney(p.hourlyRate)}</td>
                                            <td>{fmtMoney(gross)}</td>
                                            <td>{fmtMoney(deductions)}</td>
                                            <td style={{ fontWeight: 600 }}>{fmtMoney(gross - deductions)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13 }}>
                        <input type="checkbox" checked={sendOnGenerate} onChange={e => setSendOnGenerate(e.target.checked)} />
                        Email receipts to employees immediately
                    </label>

                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={onClose}>Cancel</button>
                        <button className="btn btn--primary" onClick={handleGenerate} disabled={generating || !payDate}>
                            {generating ? 'Generating...' : `Generate ${previews.length} Receipt(s)`}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}
