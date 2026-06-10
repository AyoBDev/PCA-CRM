import { useState, useRef, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import { useToast } from '../hooks/useToast';
import { useUndoStack } from '../hooks/useUndoStack';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';
import ConfirmModal from '../components/common/ConfirmModal';

const ACCOUNTS = [
    { value: '71040', label: '71040 — PCS' },
    { value: '71120', label: '71120 — Waiver 58' },
    { value: '71119', label: '71119 — Waiver 48' },
    { value: '71635', label: '71635 — ISO / SDPC' },
];

export default function SandataImportPage() {
    const { showToast } = useToast();
    const undoState = useUndoStack();
    const [accountNumber, setAccountNumber] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [preview, setPreview] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [editedIds, setEditedIds] = useState({});
    const [activeTab, setActiveTab] = useState('matched');
    const [showConfirm, setShowConfirm] = useState(false);
    const [lastApplyResult, setLastApplyResult] = useState(null);
    const [mismatchUpdates, setMismatchUpdates] = useState(new Set());
    const [updatingMismatch, setUpdatingMismatch] = useState(null);
    const [showMismatchConfirm, setShowMismatchConfirm] = useState(false);
    const [selectedMismatches, setSelectedMismatches] = useState(new Set());
    const fileInputRef = useRef(null);

    const handlePreview = async () => {
        if (!file || !accountNumber) {
            showToast('Select an account and upload a file', 'error');
            return;
        }
        setLoading(true);
        setPreview(null);
        setSelectedIds(new Set());
        setEditedIds({});
        setMismatchUpdates(new Set());
        setSelectedMismatches(new Set());
        setLastApplyResult(null);
        try {
            const data = await api.previewSandata(file, accountNumber);
            setPreview(data);
            setSelectedIds(new Set(data.matched.map(m => m.clientId)));
            setActiveTab('matched');
            showToast(`Preview: ${data.summary.matched} clients matched`, 'success');
        } catch (err) {
            showToast(err.message || 'Preview failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setFile(null);
        setAccountNumber('');
        setPreview(null);
        setSelectedIds(new Set());
        setEditedIds({});
        setMismatchUpdates(new Set());
        setSelectedMismatches(new Set());
        setLastApplyResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const toggleSelect = useCallback((clientId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(clientId)) next.delete(clientId);
            else next.add(clientId);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (!preview) return;
        setSelectedIds(prev => {
            if (prev.size === preview.matched.length) return new Set();
            return new Set(preview.matched.map(m => m.clientId));
        });
    }, [preview]);

    const handleEditId = useCallback((clientId, value) => {
        setEditedIds(prev => ({ ...prev, [clientId]: value }));
    }, []);

    const getEffectiveId = (m) => editedIds[m.clientId] !== undefined ? editedIds[m.clientId] : m.sandataClientId;

    const selectedEntries = preview?.matched.filter(m => selectedIds.has(m.clientId) && m.authCount > 0).map(m => ({
        clientId: m.clientId,
        sandataClientId: getEffectiveId(m),
    })) || [];
    const skippedCount = preview ? [...selectedIds].filter(id => {
        const m = preview.matched.find(x => x.clientId === id);
        return m && m.authCount === 0;
    }).length : 0;

    const handleApply = async () => {
        setShowConfirm(false);
        setApplying(true);
        try {
            const result = await api.applySandata(accountNumber, selectedEntries);
            const appliedCount = result.applied;
            const updatedCount = result.authorizationsUpdated;
            const prevValues = result.previousValues;
            const appliedEntries = [...selectedEntries];
            const acctNum = accountNumber;

            setLastApplyResult({ applied: appliedCount, updated: updatedCount, accountNumber: acctNum });
            showToast(`Applied: ${updatedCount} authorizations updated for ${appliedCount} clients`, 'success');

            if (updatedCount > 0 && prevValues?.length > 0) {
                undoState.pushAction(
                    `Applied SANDATA IDs to ${appliedCount} clients (${acctNum})`,
                    async () => {
                        await api.undoSandata(prevValues);
                        setLastApplyResult(null);
                        showToast('Undone: SANDATA IDs restored to previous values', 'success');
                    },
                    async () => {
                        await api.applySandata(acctNum, appliedEntries);
                        setLastApplyResult({ applied: appliedCount, updated: updatedCount, accountNumber: acctNum });
                        showToast(`Re-applied: ${updatedCount} authorizations updated`, 'success');
                    }
                );
            }
        } catch (err) {
            showToast(err.message || 'Apply failed', 'error');
        } finally {
            setApplying(false);
        }
    };

    // Mismatch update handlers
    const getMismatchKey = (m, field) => `${m.clientId}-${field}`;

    const toggleMismatchSelect = useCallback((key) => {
        setSelectedMismatches(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleAllMismatches = useCallback(() => {
        if (!preview) return;
        setSelectedMismatches(prev => {
            const allKeys = [];
            for (const m of preview.mismatches) {
                if (m.appPhone && !mismatchUpdates.has(getMismatchKey(m, 'phone'))) allKeys.push(getMismatchKey(m, 'phone'));
                if (m.appAddress && !mismatchUpdates.has(getMismatchKey(m, 'address'))) allKeys.push(getMismatchKey(m, 'address'));
            }
            if (prev.size === allKeys.length) return new Set();
            return new Set(allKeys);
        });
    }, [preview, mismatchUpdates]);

    const handleUpdateSingleMismatch = async (m, field) => {
        const key = getMismatchKey(m, field);
        setUpdatingMismatch(key);
        try {
            const newValue = field === 'phone' ? m.sandataPhone : m.sandataAddress;
            const oldValue = field === 'phone' ? m.appPhone : m.appAddress;
            const data = field === 'phone' ? { phone: newValue } : { address: newValue };
            await api.patchClient(m.clientId, data);
            setMismatchUpdates(prev => new Set([...prev, key]));
            setSelectedMismatches(prev => { const n = new Set(prev); n.delete(key); return n; });
            showToast(`Updated ${field} for ${m.clientName}`, 'success');

            undoState.pushAction(
                `Updated ${field} for ${m.clientName}`,
                async () => {
                    const revertData = field === 'phone' ? { phone: oldValue } : { address: oldValue };
                    await api.patchClient(m.clientId, revertData);
                    setMismatchUpdates(prev => { const n = new Set(prev); n.delete(key); return n; });
                    showToast(`Undone: ${field} restored for ${m.clientName}`, 'success');
                },
                async () => {
                    await api.patchClient(m.clientId, data);
                    setMismatchUpdates(prev => new Set([...prev, key]));
                    showToast(`Re-applied: ${field} updated for ${m.clientName}`, 'success');
                }
            );
        } catch (err) {
            showToast(err.message || 'Update failed', 'error');
        } finally {
            setUpdatingMismatch(null);
        }
    };

    const handleBulkUpdateMismatches = async () => {
        setShowMismatchConfirm(false);
        setUpdatingMismatch('bulk');
        let count = 0;
        const undoOps = [];
        try {
            for (const m of preview.mismatches) {
                const phoneKey = getMismatchKey(m, 'phone');
                const addrKey = getMismatchKey(m, 'address');
                const data = {};
                const revertData = {};
                if (selectedMismatches.has(phoneKey)) { data.phone = m.sandataPhone; revertData.phone = m.appPhone; }
                if (selectedMismatches.has(addrKey)) { data.address = m.sandataAddress; revertData.address = m.appAddress; }
                if (Object.keys(data).length > 0) {
                    await api.patchClient(m.clientId, data);
                    const keys = [];
                    if (data.phone) { setMismatchUpdates(prev => new Set([...prev, phoneKey])); keys.push(phoneKey); count++; }
                    if (data.address) { setMismatchUpdates(prev => new Set([...prev, addrKey])); keys.push(addrKey); count++; }
                    undoOps.push({ clientId: m.clientId, data, revertData, keys });
                }
            }
            setSelectedMismatches(new Set());
            showToast(`Updated ${count} fields across clients`, 'success');

            const totalCount = count;
            undoState.pushAction(
                `Bulk updated ${totalCount} client fields from SANDATA`,
                async () => {
                    for (const op of undoOps) {
                        await api.patchClient(op.clientId, op.revertData);
                        setMismatchUpdates(prev => {
                            const n = new Set(prev);
                            op.keys.forEach(k => n.delete(k));
                            return n;
                        });
                    }
                    showToast(`Undone: ${totalCount} fields restored`, 'success');
                },
                async () => {
                    for (const op of undoOps) {
                        await api.patchClient(op.clientId, op.data);
                        setMismatchUpdates(prev => new Set([...prev, ...op.keys]));
                    }
                    showToast(`Re-applied: ${totalCount} fields updated`, 'success');
                }
            );
        } catch (err) {
            showToast(err.message || 'Bulk update failed', 'error');
        } finally {
            setUpdatingMismatch(null);
        }
    };

    const accountLabel = ACCOUNTS.find(a => a.value === accountNumber)?.label || accountNumber;
    const allSelected = preview && selectedIds.size === preview.matched.length && preview.matched.length > 0;

    const pendingMismatchKeys = preview?.mismatches.flatMap(m => {
        const keys = [];
        if (m.appPhone && !mismatchUpdates.has(getMismatchKey(m, 'phone'))) keys.push(getMismatchKey(m, 'phone'));
        if (m.appAddress && !mismatchUpdates.has(getMismatchKey(m, 'address'))) keys.push(getMismatchKey(m, 'address'));
        return keys;
    }) || [];
    const allMismatchesSelected = pendingMismatchKeys.length > 0 && selectedMismatches.size === pendingMismatchKeys.length;

    return (
        <>
            <GlobalToolbar
                title="SANDATA Import"
                subtitle="Client ID Import & Mismatch Report"
                icon={Icons.upload}
                undoState={undoState}
            />
            <ContextBar>
                <ContextBar.Left>
                    <select
                        className="context-bar__select"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        disabled={!!preview}
                    >
                        <option value="">Select account...</option>
                        {ACCOUNTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    <label className="context-bar__file-label">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setFile(e.target.files[0])}
                            disabled={!!preview}
                            className="context-bar__file-input"
                        />
                        <span className="btn btn--outline btn--sm">
                            {Icons.upload} {file ? file.name : 'Choose File'}
                        </span>
                    </label>
                </ContextBar.Left>
                <ContextBar.Right>
                    {!preview ? (
                        <button className="btn btn--primary btn--sm" onClick={handlePreview} disabled={loading || !file || !accountNumber}>
                            {loading ? <><span className="spinner-sm" /> Loading...</> : <>{Icons.search} Preview</>}
                        </button>
                    ) : (
                        <>
                            <button
                                className="btn btn--primary btn--sm"
                                onClick={() => setShowConfirm(true)}
                                disabled={applying || selectedEntries.length === 0 || !!lastApplyResult}
                            >
                                {applying ? <><span className="spinner-sm" /> Applying...</> : <>Apply IDs ({selectedEntries.length})</>}
                            </button>
                            <button className="btn btn--outline btn--sm" onClick={handleReset} disabled={applying}>
                                Reset
                            </button>
                        </>
                    )}
                </ContextBar.Right>
            </ContextBar>

            <div className="page-content">
                {/* Success banner after applying */}
                {lastApplyResult && (
                    <div className="sandata-success-banner">
                        <span className="sandata-success-banner__icon">{Icons.checkCircle}</span>
                        <div className="sandata-success-banner__text">
                            <strong>{lastApplyResult.updated} authorizations</strong> updated for {lastApplyResult.applied} client{lastApplyResult.applied !== 1 ? 's' : ''} on account {lastApplyResult.accountNumber}.
                            {' '}Use the <strong>Undo</strong> button in the toolbar to revert.
                        </div>
                    </div>
                )}

                {preview && (
                    <>
                        <div className="sandata-stats-row">
                            <StatCard label="Total Rows" value={preview.summary.totalSandataRows} />
                            <StatCard label="Unique" value={preview.summary.uniqueRows} />
                            <StatCard label="Matched" value={preview.summary.matched} variant="success" />
                            <StatCard label="Selected" value={selectedIds.size} variant="primary" />
                            <StatCard label="Mismatches" value={preview.summary.mismatchCount} variant={preview.summary.mismatchCount > 0 ? 'danger' : 'default'} />
                            <StatCard label="Unmatched" value={preview.summary.unmatched} variant={preview.summary.unmatched > 0 ? 'warning' : 'default'} />
                        </div>

                        <div className="cp-tabs" style={{ marginBottom: 0 }}>
                            <button className={`cp-tab${activeTab === 'matched' ? ' cp-tab--active' : ''}`} onClick={() => setActiveTab('matched')}>
                                Matched <span className="cp-tab__badge">{preview.matched.length}</span>
                            </button>
                            <button className={`cp-tab${activeTab === 'mismatches' ? ' cp-tab--active' : ''}`} onClick={() => setActiveTab('mismatches')}>
                                Mismatches <span className="cp-tab__badge">{preview.mismatches.length}</span>
                            </button>
                            <button className={`cp-tab${activeTab === 'unmatched' ? ' cp-tab--active' : ''}`} onClick={() => setActiveTab('unmatched')}>
                                Unmatched <span className="cp-tab__badge">{preview.unmatched.length}</span>
                            </button>
                        </div>

                        {/* Matched tab */}
                        {activeTab === 'matched' && (
                            <>
                                <div className="table-toolbar">
                                    <div className="table-toolbar__left">
                                        <label className="sandata-select-all">
                                            <input
                                                type="checkbox"
                                                className="bulk-checkbox"
                                                checked={allSelected}
                                                onChange={toggleSelectAll}
                                            />
                                            <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                                        </label>
                                        <span className="table-toolbar__count">{selectedIds.size} of {preview.matched.length} selected</span>
                                    </div>
                                    <div className="table-toolbar__right">
                                        {preview.summary.duplicateRows > 0 && (
                                            <span className="badge badge--warning">{preview.summary.duplicateRows} duplicates skipped</span>
                                        )}
                                    </div>
                                </div>
                                <div className="table-scroll">
                                    <table className="data-table data-table--sheet data-table--dark-header">
                                        <thead>
                                            <tr>
                                                <th scope="col" style={{ width: 40 }}></th>
                                                <th scope="col">Client Name</th>
                                                <th scope="col">Medicaid ID</th>
                                                <th scope="col">New SANDATA ID</th>
                                                <th scope="col">Current ID</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.matched.map((m) => (
                                                <tr key={m.clientId} className={`${selectedIds.has(m.clientId) ? 'tr--selected' : ''}${m.authCount === 0 ? ' tr--warning' : ''}`}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            className="bulk-checkbox"
                                                            checked={selectedIds.has(m.clientId)}
                                                            onChange={() => toggleSelect(m.clientId)}
                                                        />
                                                    </td>
                                                    <td>
                                                        {m.clientName}
                                                        {m.authCount === 0 && <span className="badge badge--warning" style={{ marginLeft: 8 }}>No matching auths</span>}
                                                    </td>
                                                    <td className="mono">{m.medicaidId}</td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="sandata-inline-edit"
                                                            value={getEffectiveId(m)}
                                                            onChange={(e) => handleEditId(m.clientId, e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{m.currentSandataId || '—'}</td>
                                                </tr>
                                            ))}
                                            {preview.matched.length === 0 && (
                                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>No matches found</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* Mismatches tab */}
                        {activeTab === 'mismatches' && (
                            <>
                                <div className="table-toolbar">
                                    <div className="table-toolbar__left">
                                        {pendingMismatchKeys.length > 0 && (
                                            <label className="sandata-select-all">
                                                <input
                                                    type="checkbox"
                                                    className="bulk-checkbox"
                                                    checked={allMismatchesSelected}
                                                    onChange={toggleAllMismatches}
                                                />
                                                <span>{allMismatchesSelected ? 'Deselect All' : 'Select All'}</span>
                                            </label>
                                        )}
                                        {selectedMismatches.size > 0 && (
                                            <button
                                                className="btn btn--primary btn--sm"
                                                onClick={() => setShowMismatchConfirm(true)}
                                                disabled={updatingMismatch === 'bulk'}
                                            >
                                                {updatingMismatch === 'bulk' ? <><span className="spinner-sm" /> Updating...</> : <>Update Selected ({selectedMismatches.size})</>}
                                            </button>
                                        )}
                                        {selectedMismatches.size === 0 && pendingMismatchKeys.length > 0 && (
                                            <span className="table-toolbar__count">Select rows to update app data with SANDATA values</span>
                                        )}
                                    </div>
                                    <div className="table-toolbar__right">
                                        <button className="btn btn--outline btn--sm" onClick={() => downloadMismatchCsv(preview.mismatches, preview.accountNumber)}>
                                            {Icons.download} Export CSV
                                        </button>
                                    </div>
                                </div>
                                <div className="table-scroll">
                                    <table className="data-table data-table--sheet data-table--dark-header">
                                        <thead>
                                            <tr>
                                                <th scope="col" style={{ width: 40 }}></th>
                                                <th scope="col">Client Name</th>
                                                <th scope="col">Field</th>
                                                <th scope="col">Current (App)</th>
                                                <th scope="col">SANDATA Value</th>
                                                <th scope="col" style={{ width: 90 }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.mismatches.flatMap((m, i) => {
                                                const rows = [];
                                                if (m.appPhone) {
                                                    const key = getMismatchKey(m, 'phone');
                                                    const done = mismatchUpdates.has(key);
                                                    rows.push(
                                                        <tr key={`${i}-phone`} className={done ? 'tr--done' : selectedMismatches.has(key) ? 'tr--selected' : ''}>
                                                            <td>
                                                                {!done && (
                                                                    <input
                                                                        type="checkbox"
                                                                        className="bulk-checkbox"
                                                                        checked={selectedMismatches.has(key)}
                                                                        onChange={() => toggleMismatchSelect(key)}
                                                                    />
                                                                )}
                                                                {done && <span className="sandata-check">{Icons.check}</span>}
                                                            </td>
                                                            <td>{m.clientName}</td>
                                                            <td><span className="badge badge--blue">Phone</span></td>
                                                            <td>{m.appPhone}</td>
                                                            <td><strong>{m.sandataPhone}</strong></td>
                                                            <td>
                                                                {done ? (
                                                                    <span className="sandata-done-label">Updated</span>
                                                                ) : (
                                                                    <button
                                                                        className="btn btn--outline btn--xs"
                                                                        onClick={() => handleUpdateSingleMismatch(m, 'phone')}
                                                                        disabled={!!updatingMismatch}
                                                                    >
                                                                        {updatingMismatch === key ? '...' : 'Use This'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                if (m.appAddress) {
                                                    const key = getMismatchKey(m, 'address');
                                                    const done = mismatchUpdates.has(key);
                                                    rows.push(
                                                        <tr key={`${i}-addr`} className={done ? 'tr--done' : selectedMismatches.has(key) ? 'tr--selected' : ''}>
                                                            <td>
                                                                {!done && (
                                                                    <input
                                                                        type="checkbox"
                                                                        className="bulk-checkbox"
                                                                        checked={selectedMismatches.has(key)}
                                                                        onChange={() => toggleMismatchSelect(key)}
                                                                    />
                                                                )}
                                                                {done && <span className="sandata-check">{Icons.check}</span>}
                                                            </td>
                                                            <td>{m.clientName}</td>
                                                            <td><span className="badge badge--purple">Address</span></td>
                                                            <td>{m.appAddress}</td>
                                                            <td><strong>{m.sandataAddress}</strong></td>
                                                            <td>
                                                                {done ? (
                                                                    <span className="sandata-done-label">Updated</span>
                                                                ) : (
                                                                    <button
                                                                        className="btn btn--outline btn--xs"
                                                                        onClick={() => handleUpdateSingleMismatch(m, 'address')}
                                                                        disabled={!!updatingMismatch}
                                                                    >
                                                                        {updatingMismatch === key ? '...' : 'Use This'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                return rows;
                                            })}
                                            {preview.mismatches.length === 0 && (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>No mismatches — all data matches</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* Unmatched tab */}
                        {activeTab === 'unmatched' && (
                            <div className="table-scroll">
                                <table className="data-table data-table--sheet data-table--dark-header">
                                    <thead>
                                        <tr>
                                            <th scope="col">SANDATA Name</th>
                                            <th scope="col">Medicaid ID</th>
                                            <th scope="col">SANDATA Client ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.unmatched.map((u, i) => (
                                            <tr key={i}>
                                                <td>{u.name}</td>
                                                <td className="mono">{u.medicaidId}</td>
                                                <td className="mono">{u.sandataClientId}</td>
                                            </tr>
                                        ))}
                                        {preview.unmatched.length === 0 && (
                                            <tr><td colSpan={3} style={{ textAlign: 'center', padding: 32, color: 'hsl(var(--muted-foreground))' }}>All rows matched</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {/* Empty state */}
                {!preview && !loading && (
                    <div className="sandata-empty">
                        <div className="sandata-empty__icon">{Icons.upload}</div>
                        <h3 className="sandata-empty__title">Import SANDATA Client IDs</h3>
                        <p className="sandata-empty__desc">
                            Upload a SANDATA Client Roster report to preview matches, edit Client IDs, update address/phone data, and apply to authorizations.
                        </p>
                        <div className="sandata-empty__steps">
                            <div className="sandata-step"><span className="sandata-step__num">1</span> Select account &amp; upload .xlsx file</div>
                            <div className="sandata-step"><span className="sandata-step__num">2</span> Preview — nothing is saved yet</div>
                            <div className="sandata-step"><span className="sandata-step__num">3</span> Select rows, edit IDs if needed</div>
                            <div className="sandata-step"><span className="sandata-step__num">4</span> Review mismatches — update address/phone if needed</div>
                            <div className="sandata-step"><span className="sandata-step__num">5</span> Apply selected to save to authorizations</div>
                        </div>
                    </div>
                )}
            </div>

            {showConfirm && (
                <ConfirmModal
                    title="Apply SANDATA Client IDs"
                    message={`This will set the SANDATA Client ID on authorizations for ${selectedEntries.length} client${selectedEntries.length !== 1 ? 's' : ''} under account ${accountLabel}.${skippedCount > 0 ? ` (${skippedCount} selected client${skippedCount !== 1 ? 's' : ''} skipped — no matching authorizations)` : ''} Existing IDs will be overwritten.`}
                    confirmLabel="Apply"
                    onConfirm={handleApply}
                    onCancel={() => setShowConfirm(false)}
                />
            )}

            {showMismatchConfirm && (
                <ConfirmModal
                    title="Update Client Data"
                    message={`This will update ${selectedMismatches.size} field${selectedMismatches.size !== 1 ? 's' : ''} on client records with SANDATA values. This will overwrite the current values in the app.`}
                    confirmLabel="Update"
                    onConfirm={handleBulkUpdateMismatches}
                    onCancel={() => setShowMismatchConfirm(false)}
                />
            )}
        </>
    );
}

function downloadMismatchCsv(mismatches, accountNumber) {
    const rows = [['Client Name', 'Medicaid ID', 'Field', 'App Value', 'SANDATA Value']];
    for (const m of mismatches) {
        if (m.appPhone) rows.push([m.clientName, m.medicaidId, 'Phone', m.appPhone, m.sandataPhone]);
        if (m.appAddress) rows.push([m.clientName, m.medicaidId, 'Address', m.appAddress, m.sandataAddress]);
    }
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sandata-mismatches-${accountNumber}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function StatCard({ label, value, variant = 'default' }) {
    return (
        <div className={`sandata-stat-card sandata-stat-card--${variant}`}>
            <div className="sandata-stat-card__value">{value}</div>
            <div className="sandata-stat-card__label">{label}</div>
        </div>
    );
}
