import { useState, useEffect, useCallback, useMemo, useRef, Fragment, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { fmtDate } from '../utils/dates';
import { hhmm12 } from '../utils/time';
import { visitRowClass } from '../utils/status';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { ActivityButton } from '../components/common/ActivityDrawer';

// ────────────────────────────────────────
// PayrollUploadModal
// ────────────────────────────────────────
function PayrollUploadModal({ onUpload, onClose }) {
    const [name, setName]               = useState('');
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd]     = useState('');
    const [file, setFile]               = useState(null);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) { setError('Please select an XLSX file.'); return; }
        setLoading(true);
        setError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('name', name.trim() || file.name);
            if (periodStart) fd.append('periodStart', periodStart);
            if (periodEnd)   fd.append('periodEnd',   periodEnd);
            const run = await api.uploadPayrollRun(fd);
            onUpload(run);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">New Payroll Run</h2>
            <p className="modal__desc">Upload an XLSX export from the scheduling system to process payroll.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="payrollRunName">Run Name</label>
                    <input id="payrollRunName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Feb 2026 Week 1" />
                </div>
                <div className="form-group">
                    <label htmlFor="periodStart">Period Start</label>
                    <input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="periodEnd">Period End</label>
                    <input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="payrollFile">XLSX File <span style={{ color: 'hsl(var(--destructive))' }}>*</span></label>
                    <input id="payrollFile" type="file" accept=".xlsx,.xls" required onChange={(e) => setFile(e.target.files[0] || null)} />
                </div>
                {error && <p style={{ color: 'hsl(var(--destructive))', fontSize: 13, marginBottom: 8 }}>{error}</p>}
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={loading}>
                        {loading ? 'Processing…' : 'Upload & Process'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// ────────────────────────────────────────
// PayrollClientGroup
// ────────────────────────────────────────
// Derive service code from service name (mirrors server SERVICE_CODE_RULES)
function deriveServiceCode(serviceName) {
    if (!serviceName) return '';
    const lower = serviceName.toLowerCase();
    const rules = [
        { terms: ['self', 'directed'],  code: 'SDPC'  },
        { terms: ['self', 'direct'],    code: 'SDPC'  },
        { terms: ['personal', 'care'],  code: 'PCS'   },
        { terms: ['homemaker'],         code: 'S5130' },
        { terms: ['attendant'],         code: 'S5125' },
        { terms: ['companion'],         code: 'S5135' },
        { terms: ['respite'],           code: 'S5150' },
    ];
    for (const rule of rules) {
        if (rule.terms.every(t => lower.includes(t))) return rule.code;
    }
    return '';
}

const PayrollClientGroup = memo(function PayrollClientGroup({ clientName, visits, onVisitChange, authMap, mergedOriginalsMap, readOnly }) {
    // Match server normalizeName: lowercase, strip non-alphanumeric, sort words
    const clientKey = (clientName || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
    const clientAuthMap = (authMap && authMap[clientKey]) || {};

    // Auth banner: authorization-driven — show every authorized service code,
    // matched against reported units from the payroll visits
    const authSummary = useMemo(() => {
        // Sum reported units by service code — ALL visits regardless of status
        const reportedMap = new Map();
        for (const v of visits) {
            const code = v.serviceCode || deriveServiceCode(v.service);
            if (!code) continue;
            reportedMap.set(code, (reportedMap.get(code) || 0) + (v.unitsRaw || 0));
        }

        // Build summary from authorizations first (so all authorized codes show)
        const result = new Map();
        for (const [code, authorized] of Object.entries(clientAuthMap)) {
            const reported = reportedMap.get(code) || 0;
            result.set(code, { reported, authorized });
        }

        // Add any reported codes that don't have an authorization (unmatched)
        for (const [code, reported] of reportedMap) {
            if (!result.has(code)) {
                result.set(code, { reported, authorized: null });
            }
        }

        // Sort: PCS → S5125 → S5130 → S5150 → S5135 → SDPC
        const svcOrder = { PCS: 0, S5125: 1, S5130: 2, S5150: 3, S5135: 4, SDPC: 5 };
        return [...result.entries()].sort((a, b) => (svcOrder[a[0]] ?? 99) - (svcOrder[b[0]] ?? 99));
    }, [visits, clientAuthMap]);

    const total = useMemo(() =>
        visits.filter((v) => !v.voidFlag && !v.needsReview).reduce((s, v) => s + v.finalPayableUnits, 0),
        [visits]
    );

    // Employee totals: grouped by normalized employeeName (case-insensitive), including void rows
    const employeeTotals = useMemo(() => {
        const map = new Map();       // normalized key → { displayName, units, voidUnits }
        for (const v of visits) {
            if (v.needsReview) continue;
            const raw = v.employeeName || '(Unknown)';
            const key = raw.toLowerCase().trim();
            if (!map.has(key)) map.set(key, { displayName: raw, units: 0, voidUnits: 0 });
            const entry = map.get(key);
            if (v.voidFlag) {
                entry.voidUnits += 1;
            } else {
                entry.units += v.finalPayableUnits;
            }
        }
        return [...map.entries()]
            .map(([, data]) => [data.displayName, { units: data.units, voidUnits: data.voidUnits }])
            .sort((a, b) => a[0].localeCompare(b[0]));
    }, [visits]);

    // Assign a distinct left-border color to each employee (only when 2+ employees)
    const EMP_COLORS = [
        'hsl(221 83% 53%)',  // blue
        'hsl(142 71% 35%)',  // green
        'hsl(291 64% 42%)',  // purple
        'hsl(24 95% 48%)',   // orange
        'hsl(346 77% 49%)',  // red-pink
        'hsl(187 71% 38%)',  // teal
        'hsl(43 96% 46%)',   // amber
        'hsl(262 52% 47%)',  // indigo
    ];
    const employeeColorMap = useMemo(() => {
        const seen = [];  // normalized keys in insertion order
        for (const v of visits) {
            const emp = v.employeeName || '';
            const key = emp.toLowerCase().trim();
            if (key && !seen.includes(key)) seen.push(key);
        }
        if (seen.length < 2) return null;
        const map = new Map();
        seen.forEach((key, i) => map.set(key, EMP_COLORS[i % EMP_COLORS.length]));
        return map;
    }, [visits]);

    return (
        <div className="payroll-client-group">
            <div className="payroll-client-banner">
                <span>{clientName || <em style={{ color: 'hsl(270 50% 40%)' }}>Unknown Client</em>}</span>
                {authSummary.length > 0 && (
                    <span className="payroll-client-banner__auths">
                        {authSummary.map(([code, { reported, authorized }], i) => {
                            let color = 'inherit';
                            if (authorized != null) {
                                color = reported >= authorized ? 'hsl(142 71% 35%)' : 'hsl(0 72% 45%)';
                            }
                            return (
                                <span key={code} style={{ color, marginLeft: i > 0 ? 12 : 0 }}>
                                    {code}:{reported}{authorized != null ? `/${authorized}` : ''}
                                </span>
                            );
                        })}
                    </span>
                )}
            </div>
            <table className="payroll-visits-table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Employee</th>
                        <th>Service</th>
                        <th>Date</th>
                        <th>In</th>
                        <th>Out</th>
                        <th>Status</th>
                        <th>Units (Raw)</th>
                        <th>Final Units</th>
                        <th>Overlap</th>
                        <th>Void / Review Reason</th>
                        <th>Notes / Exceptions</th>
                    </tr>
                </thead>
                <tbody>
                    {visits.map((v) => {
                        const empColor = employeeColorMap?.get((v.employeeName || '').toLowerCase().trim());
                        const originals = mergedOriginalsMap?.get(v.id);
                        return (
                        <Fragment key={v.id}>
                        <tr className={visitRowClass(v)} style={empColor ? { borderLeft: `4px solid ${empColor}` } : undefined}>
                            <td>
                                {readOnly ? (v.clientName || <em style={{ color: 'hsl(270 50% 40%)' }}>missing client…</em>) : (
                                <PayrollEditableText
                                    value={v.clientName}
                                    placeholder="missing client…"
                                    highlight={!v.clientName}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { clientName: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                />
                                )}
                            </td>
                            <td style={empColor ? { color: empColor, fontWeight: 600, whiteSpace: 'nowrap' } : undefined}>
                                {readOnly ? (v.employeeName || <em style={{ color: 'hsl(270 50% 40%)' }}>missing employee…</em>) : (
                                <PayrollEditableText
                                    value={v.employeeName}
                                    placeholder="missing employee…"
                                    highlight={!v.employeeName || /^\d+$/.test(v.employeeName)}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { employeeName: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                />
                                )}
                            </td>
                            <td>{v.service || '—'}</td>
                            <td>{v.visitDate ? new Date(v.visitDate).toLocaleDateString('en-US', { timeZone: 'UTC' }) : <em style={{ color: 'hsl(270 50% 40%)' }}>missing</em>}</td>
                            <td style={v.earlyCallIn ? { background: 'hsl(38 96% 88%)', fontWeight: 600 } : undefined}>
                                {readOnly ? (hhmm12(v.callInTime) || <em style={{ color: 'hsl(270 50% 40%)' }}>—</em>) : (
                                <PayrollEditableText
                                    value={v.callInTime}
                                    displayValue={hhmm12(v.callInTime)}
                                    placeholder="HH:MM"
                                    highlight={!v.callInTime || v.callInTime === '00:00'}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { callInTime: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                    width={75}
                                />
                                )}
                            </td>
                            <td style={(v.lateCallOut || v.nextDayCallOut) ? { background: 'hsl(38 96% 88%)', fontWeight: 600 } : undefined}>
                                {readOnly ? (hhmm12(v.callOutTime) || <em style={{ color: 'hsl(270 50% 40%)' }}>—</em>) : (
                                <PayrollEditableText
                                    value={v.callOutTime}
                                    displayValue={hhmm12(v.callOutTime)}
                                    placeholder="HH:MM"
                                    highlight={!v.callOutTime || v.callOutTime === '00:00'}
                                    onSave={async (val) => {
                                        const updated = await api.updatePayrollVisit(v.id, { callOutTime: val });
                                        onVisitChange(v.id, updated);
                                    }}
                                    width={75}
                                />
                                )}
                            </td>
                            <td>{v.visitStatus}</td>
                            <td style={v.unitsRaw > 28 && !v.voidFlag && !v.needsReview ? { background: 'hsl(0 84% 92%)', fontWeight: 700 } : undefined}>{v.unitsRaw}</td>
                            <td>
                                {readOnly ? (v.voidFlag ? <span style={{ color: 'hsl(var(--destructive))' }}>VOID</span> : v.finalPayableUnits) : (
                                <PayrollEditableUnits
                                    visit={v}
                                    onChange={(newUnits) => onVisitChange(v.id, { finalPayableUnits: newUnits })}
                                />
                                )}
                            </td>
                            <td>{v.overlapId || ''}</td>
                            <td>
                                {v.needsReview
                                    ? <span style={{ color: 'hsl(270 50% 40%)', fontWeight: 600 }}>{v.reviewReason}</span>
                                    : (v.voidReason || '')}
                            </td>
                            <td>
                                {readOnly ? (v.notes || '—') : (
                                <PayrollEditableNotes
                                    visit={v}
                                    onChange={(newNotes) => onVisitChange(v.id, { notes: newNotes })}
                                />
                                )}
                            </td>
                        </tr>
                        {originals && originals.map((orig) => {
                            const s = { color: 'hsl(240 3.8% 46.1%)', fontSize: 12 };
                            return (
                            <tr key={`orig-${orig.id}`} className="payroll-row--merged-original">
                                <td style={{ paddingLeft: 24 }}>
                                    <span style={s}>↳ {orig.clientName || ''}</span>
                                </td>
                                <td><span style={s}>{orig.employeeName || ''}</span></td>
                                <td><span style={s}>{orig.service || '—'}</span></td>
                                <td><span style={s}>{orig.visitDate ? new Date(orig.visitDate).toLocaleDateString('en-US', { timeZone: 'UTC' }) : ''}</span></td>
                                <td><span style={s}>{hhmm12(orig.callInTime) || '—'}</span></td>
                                <td><span style={s}>{hhmm12(orig.callOutTime) || '—'}</span></td>
                                <td><span style={{ ...s, fontStyle: 'italic' }}>{orig.visitStatus || ''}</span></td>
                                <td><span style={s}>{orig.unitsRaw || ''}</span></td>
                                <td><span style={s}>{orig.finalPayableUnits || ''}</span></td>
                                <td><span style={s}>{orig.overlapId || ''}</span></td>
                                <td><span style={s}>{orig.reviewReason || ''}</span></td>
                                <td><span style={s}>{orig.notes || ''}</span></td>
                            </tr>
                            );
                        })}
                        </Fragment>
                        );
                    })}
                    <tr className="payroll-total-row">
                        <td colSpan={8} style={{ textAlign: 'right' }}>TOTAL</td>
                        <td>{total}</td>
                        <td colSpan={3}></td>
                    </tr>
                    {employeeTotals.length > 0 && (
                        <tr className="payroll-employee-totals-row">
                            <td colSpan={12}>
                                <span className="payroll-employee-totals__label">By Employee:</span>
                                {employeeTotals.map(([emp, { units, voidUnits }]) => (
                                    <span key={emp} className="payroll-employee-totals__item">
                                        <span className="payroll-employee-totals__name" style={employeeColorMap?.get(emp.toLowerCase().trim()) ? { color: employeeColorMap.get(emp.toLowerCase().trim()) } : undefined}>{emp}</span>
                                        <span className="payroll-employee-totals__units">{units} units · {(units / 4).toFixed(2)} hrs</span>
                                        {voidUnits > 0 && <span className="payroll-employee-totals__void">{voidUnits} void</span>}
                                    </span>
                                ))}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
});

// ────────────────────────────────────────
// PayrollEditableText — generic inline text editor for any visit field
// Used for clientName, employeeName, callInTime, callOutTime
// ────────────────────────────────────────
const PayrollEditableText = memo(function PayrollEditableText({ value, displayValue, placeholder, highlight, onSave, width = 130 }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft]     = useState(value || '');
    const [saving, setSaving]   = useState(false);

    // keep draft in sync if parent updates the value (e.g. after server recalc)
    const prevValue = useRef(value);
    if (prevValue.current !== value) {
        prevValue.current = value;
        if (!editing) setDraft(value || '');
    }

    const commit = async () => {
        const trimmed = draft.trim();
        if (trimmed === (value || '').trim()) { setEditing(false); return; }
        setSaving(true);
        try {
            await onSave(trimmed);
        } catch (_) {
            setDraft(value || '');
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
                }}
                autoFocus
                placeholder={placeholder}
                style={{ width, padding: '2px 6px', fontSize: 13 }}
            />
        );
    }

    const isEmpty = !value || value === '00:00';
    return (
        <span
            title="Click to edit"
            onClick={() => { setDraft(value || ''); setEditing(true); }}
            style={{
                cursor: 'pointer',
                color: isEmpty || highlight ? 'hsl(270 50% 40%)' : 'inherit',
                fontStyle: isEmpty ? 'italic' : 'normal',
                fontWeight: highlight && !isEmpty ? 600 : 'normal',
                borderBottom: '1px dashed hsl(var(--border))',
                paddingBottom: 1,
                opacity: saving ? 0.5 : 1,
                whiteSpace: 'nowrap',
            }}
        >
            {isEmpty ? placeholder : (displayValue ?? value)}
        </span>
    );
});

// ────────────────────────────────────────
// PayrollEditableUnits — inline number editor
// ────────────────────────────────────────
const PayrollEditableUnits = memo(function PayrollEditableUnits({ visit, onChange }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue]     = useState(String(visit.finalPayableUnits));
    const [saving, setSaving]   = useState(false);

    const commit = async () => {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0 || n === visit.finalPayableUnits) {
            setValue(String(visit.finalPayableUnits));
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await api.updatePayrollVisit(visit.id, { finalPayableUnits: n });
            onChange(n);
        } catch (_) {
            setValue(String(visit.finalPayableUnits));
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    if (visit.voidFlag) return <span style={{ color: 'hsl(var(--destructive))' }}>VOID</span>;

    if (editing) {
        return (
            <input
                type="number" min="0" max="112"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(String(visit.finalPayableUnits)); setEditing(false); } }}
                autoFocus
                style={{ width: 56, padding: '2px 4px', fontSize: 13, textAlign: 'center' }}
            />
        );
    }

    return (
        <span
            title="Click to edit"
            onClick={() => { setValue(String(visit.finalPayableUnits)); setEditing(true); }}
            style={{ cursor: 'pointer', borderBottom: '1px dashed hsl(var(--border))', paddingBottom: 1, opacity: saving ? 0.5 : 1 }}
        >
            {visit.finalPayableUnits}
        </span>
    );
});

// ────────────────────────────────────────
// PayrollEditableNotes — inline text editor
// ────────────────────────────────────────
const PayrollEditableNotes = memo(function PayrollEditableNotes({ visit, onChange }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue]     = useState(visit.notes || '');
    const [saving, setSaving]   = useState(false);

    const commit = async () => {
        const trimmed = value.trim();
        if (trimmed === (visit.notes || '').trim()) { setEditing(false); return; }
        setSaving(true);
        try {
            await api.updatePayrollVisit(visit.id, { notes: trimmed });
            onChange(trimmed);
        } catch (_) {
            setValue(visit.notes || '');
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(visit.notes || ''); setEditing(false); } }}
                autoFocus
                placeholder="Add note…"
                style={{ width: 200, padding: '2px 6px', fontSize: 13 }}
            />
        );
    }

    return (
        <span
            title="Click to edit"
            onClick={() => { setValue(visit.notes || ''); setEditing(true); }}
            style={{ cursor: 'pointer', color: value ? 'inherit' : 'hsl(240 3.8% 46.1%)', fontStyle: value ? 'normal' : 'italic', borderBottom: '1px dashed hsl(var(--border))', paddingBottom: 1, opacity: saving ? 0.5 : 1, whiteSpace: 'nowrap' }}
        >
            {value || 'add note…'}
        </span>
    );
});

// ────────────────────────────────────────
// PayrollRunDetail
// ────────────────────────────────────────
// Service code sort order: PCS → S5125/S5130 (interleaved by date) → S5150 → S5135 → SDPC
const SVC_ORDER = { PCS: 0, S5125: 1, S5130: 1, S5150: 2, S5135: 3, SDPC: 4 };
const SVC_NAME_RULES = [
    { terms: ['self', 'directed'],  order: 4 },
    { terms: ['self', 'direct'],    order: 4 },
    { terms: ['personal', 'care'],  order: 0 },
    { terms: ['homemaker'],         order: 1 },
    { terms: ['attendant'],         order: 1 },
    { terms: ['companion'],         order: 3 },
    { terms: ['respite'],           order: 2 },
];
function getKnownSvcOrder(v) {
    if (v.serviceCode && SVC_ORDER[v.serviceCode] != null) return SVC_ORDER[v.serviceCode];
    const lower = (v.service || '').toLowerCase();
    for (const rule of SVC_NAME_RULES) {
        if (rule.terms.every((t) => lower.includes(t))) return rule.order;
    }
    return null;
}
const isUnknownClient = (name) => !name || name === '(Unknown Client)' || /^\d/.test(name) || /^\(/.test(name);
function PayrollRunDetail({ run, onVisitChange, authMap, readOnly }) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [legendFilter, setLegendFilter] = useState(null);

    // Debounce search to avoid re-rendering hundreds of rows on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Build lookup: mergedVisitId → [originalRows] for displaying originals under merged rows
    const mergedOriginalsMap = useMemo(() => {
        const map = new Map();
        for (const v of run.visits) {
            if (v.mergedInto != null) {
                if (!map.has(v.mergedInto)) map.set(v.mergedInto, []);
                map.get(v.mergedInto).push(v);
            }
        }
        return map;
    }, [run.visits]);

    // Precompute lowercase names for fast search (avoids repeated toLowerCase on each keystroke)
    const searchableVisits = useMemo(() => {
        const all = run.visits.filter((v) => v.mergedInto == null);
        return all.map(v => ({
            v,
            clientLower: (v.clientName || '').toLowerCase(),
            empLower: (v.employeeName || '').toLowerCase(),
        }));
    }, [run.visits]);

    const visibleVisits = useMemo(() => {
        let filtered = searchableVisits;

        if (legendFilter) {
            filtered = filtered.filter(({ v }) => {
                if (legendFilter === 'void')        return v.voidFlag;
                if (legendFilter === 'incomplete')  return v.isIncomplete;
                if (legendFilter === 'unauthorized') return v.isUnauthorized;
                if (legendFilter === 'overlap')     return !!v.overlapId;
                if (legendFilter === 'overcap')     return v.unitsRaw > 28 && !v.voidFlag;
                if (legendFilter === 'timeflag')    return v.earlyCallIn || v.lateCallOut || v.nextDayCallOut;
                if (legendFilter === 'review')      return v.needsReview;
                return true;
            });
        }

        if (debouncedSearch.trim()) {
            const q = debouncedSearch.trim().toLowerCase();
            filtered = filtered.filter(({ clientLower, empLower }) =>
                clientLower.includes(q) || empLower.includes(q)
            );
        }

        return filtered.map(({ v }) => v);
    }, [searchableVisits, debouncedSearch, legendFilter]);

    const clientGroups = useMemo(() => {
        const map = new Map();
        for (const v of visibleVisits) {
            const key = v.clientName || '(Unknown Client)';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(v);
        }
        // Sort: service group → date → time-in
        // No-service rows attach to the service group that has the most entries
        // on the same date; if no same-date match, defaults to PCS (group 0)
        for (const [, arr] of map) {
            const orders = arr.map(v => getKnownSvcOrder(v));

            // Precompute date strings to avoid repeated Date parsing in O(n²) loop
            const dateStrs = arr.map(v => v.visitDate ? new Date(v.visitDate).toISOString().slice(0, 10) : '');

            // Resolve unknown service orders by matching to same-date group
            for (let i = 0; i < orders.length; i++) {
                if (orders[i] != null) continue;
                const vDateStr = dateStrs[i];
                // Count how many known visits each service group has on the same date
                const groupCounts = new Map();
                for (let j = 0; j < arr.length; j++) {
                    if (j === i || orders[j] == null) continue;
                    if (dateStrs[j] === vDateStr) {
                        groupCounts.set(orders[j], (groupCounts.get(orders[j]) || 0) + 1);
                    }
                }
                if (groupCounts.size > 0) {
                    // Pick the group with the most entries on this date
                    let best = 0, bestCount = 0;
                    for (const [grp, cnt] of groupCounts) {
                        if (cnt > bestCount || (cnt === bestCount && grp < best)) {
                            best = grp;
                            bestCount = cnt;
                        }
                    }
                    orders[i] = best;
                } else {
                    orders[i] = 0; // default to PCS group
                }
            }

            const sortKeys = arr.map((v, i) => ({
                v,
                svc: orders[i],
                date: v.visitDate ? new Date(v.visitDate).getTime() : 0,
                time: v.callInTime || '',
            }));
            sortKeys.sort((a, b) => {
                if (a.svc !== b.svc) return a.svc - b.svc;
                if (a.date !== b.date) return a.date - b.date;
                return a.time.localeCompare(b.time);
            });
            for (let i = 0; i < arr.length; i++) arr[i] = sortKeys[i].v;
        }
        // Sort client groups: real names first (alphabetical), then unknown/phone at bottom
        return [...map.entries()].sort((a, b) => {
            const aBottom = isUnknownClient(a[0]);
            const bBottom = isUnknownClient(b[0]);
            if (aBottom !== bBottom) return aBottom ? 1 : -1;
            return a[0].localeCompare(b[0]);
        });
    }, [visibleVisits]);

    return (
        <div>
            <div className="payroll-legend">
                {[
                    { key: 'void',         label: 'Void',                                                      cls: 'void' },
                    { key: 'incomplete',   label: 'Incomplete',                                                cls: 'incomplete' },
                    { key: 'unauthorized', label: 'Unauthorized',                                              cls: 'unauthorized' },
                    { key: 'overlap',      label: 'Overlap',                                                   cls: 'overlap' },
                    { key: 'overcap',      label: 'Over daily cap (28 units)',                                  cls: 'overcap' },
                    { key: 'timeflag',     label: 'Time violation (In <4:30 AM / Out >11:30 PM / next day)',   cls: 'timeflag' },
                    { key: 'review',       label: 'Needs Review',                                              cls: 'review' },
                ].map(({ key, label, cls }) => (
                    <button
                        key={key}
                        type="button"
                        className={`payroll-legend__item payroll-legend__item--${cls}${legendFilter === key ? ' payroll-legend__item--active' : ''}`}
                        onClick={() => setLegendFilter((f) => f === key ? null : key)}
                        title={legendFilter === key ? 'Click to clear filter' : `Click to filter by: ${label}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div style={{ margin: '12px 0' }}>
                <input
                    type="search"
                    placeholder="Search by client or employee…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: 280, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                />
                {search && (
                    <span style={{ marginLeft: 10, fontSize: 12, color: 'hsl(240 3.8% 46.1%)' }}>
                        {visibleVisits.length} visit{visibleVisits.length !== 1 ? 's' : ''} found
                    </span>
                )}
            </div>

            {clientGroups.map(([clientName, visits]) => (
                <PayrollClientGroup key={clientName} clientName={clientName} visits={visits} onVisitChange={onVisitChange} authMap={authMap} mergedOriginalsMap={mergedOriginalsMap} readOnly={readOnly} />
            ))}

            {clientGroups.length === 0 && (
                <p style={{ color: 'hsl(240 3.8% 46.1%)', fontStyle: 'italic' }}>
                    {search ? `No visits match "${search}".` : 'No visit records in this run.'}
                </p>
            )}
        </div>
    );
}

// ────────────────────────────────────────
// PayrollPage
// ────────────────────────────────────────
function PayrollPage() {
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const { runId } = useParams();
    const navigate = useNavigate();
    const initialRunId = runId ? parseInt(runId, 10) : null;
    const onNavigate = useCallback((path) => navigate('/' + path), [navigate]);
    const [runs, setRuns]               = useState([]);
    const [selectedRun, setSelectedRun] = useState(null);
    const [loading, setLoading]         = useState(true);
    const [modal, setModal]             = useState(null);
    const [exporting, setExporting]     = useState(false);
    const [showArchived, setShowArchived] = useState(false);

    // Optimistically update a visit field in selectedRun state after a successful PATCH
    // patch may be a plain object (optimistic update) or a full visit from the server
    const handleVisitChange = useCallback((visitId, patch) => {
        setSelectedRun((prev) => {
            if (!prev) return prev;
            const visits = prev.visits.map((v) => v.id === visitId ? { ...v, ...patch } : v);
            const totalPayable = visits.filter((v) => !v.voidFlag && !v.needsReview && v.mergedInto == null).reduce((s, v) => s + v.finalPayableUnits, 0);
            return { ...prev, visits, totalPayable };
        });
    }, []);

    const loadRuns = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getPayrollRuns({ archived: showArchived });
            setRuns(data);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast, showArchived]);

    useEffect(() => { loadRuns(); }, [loadRuns]);

    // On mount (or when initialRunId changes from URL), load that run
    useEffect(() => {
        if (!initialRunId) return;
        api.getPayrollRun(initialRunId)
            .then(setSelectedRun)
            .catch(() => onNavigate('payroll')); // run not found — fall back to list
    }, [initialRunId, onNavigate]);

    const handleRunClick = async (run) => {
        try {
            const full = await api.getPayrollRun(run.id);
            setSelectedRun(full);
            onNavigate(`payroll/runs/${run.id}`);
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleUpload = (run) => {
        setModal(null);
        showToast('Payroll run processed successfully.', 'success');
        loadRuns();
        setSelectedRun(run);
        onNavigate(`payroll/runs/${run.id}`);
    };

    const handleDelete = async (run) => {
        try {
            await api.deletePayrollRun(run.id);
            setModal(null);
            if (selectedRun?.id === run.id) {
                setSelectedRun(null);
                onNavigate('payroll');
            }
            loadRuns();
            showUndoToast(`"${run.name}" archived`, async () => {
                await api.restorePayrollRun(run.id);
                loadRuns();
            });
        } catch (err) {
            showToast(err.message, 'error');
            setModal(null);
        }
    };

    const handleRestore = async (run) => {
        try {
            await api.restorePayrollRun(run.id);
            showToast(`"${run.name}" restored`);
            loadRuns();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handlePermanentDelete = async (run) => {
        try {
            await api.permanentlyDeletePayrollRun(run.id);
            setModal(null);
            showToast(`"${run.name}" permanently deleted`);
            loadRuns();
        } catch (err) {
            showToast(err.message, 'error');
            setModal(null);
        }
    };

    const handleBulkPermanentDelete = async () => {
        try {
            const result = await api.bulkPermanentlyDeletePayrollRuns();
            setModal(null);
            showToast(`${result.count} archived payroll run(s) permanently deleted`);
            loadRuns();
        } catch (err) {
            showToast(err.message, 'error');
            setModal(null);
        }
    };

    const handleExport = async () => {
        if (!selectedRun) return;
        setExporting(true);
        try {
            const res = await fetch(`/api/payroll/runs/${selectedRun.id}/export`, {
                headers: { Authorization: `Bearer ${api.getToken()}` },
            });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b.error || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `payroll_${selectedRun.name.replace(/\s+/g, '_')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setExporting(false);
        }
    };

    if (selectedRun) {
        return (
            <div>
                <div className="content-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button className="btn btn--outline btn--sm" onClick={() => { setSelectedRun(null); onNavigate('payroll'); }}>
                            ← Back
                        </button>
                        <h1 className="content-header__title">{selectedRun.name}</h1>
                        <span style={{ fontSize: 12, color: 'hsl(240 3.8% 46.1%)' }}>
                            {selectedRun.totalVisits} visits · {selectedRun.totalPayable} payable units
                        </span>
                    </div>
                    <div className="content-header__actions">
                        {isAdmin && <ActivityButton entityType="PayrollRun" />}
                        <button className="btn btn--primary btn--sm" onClick={handleExport} disabled={exporting}>
                            {Icons.download} {exporting ? 'Exporting…' : 'Export XLSX'}
                        </button>
                    </div>
                </div>
                <div className="page-content">
                    <PayrollRunDetail run={selectedRun} onVisitChange={handleVisitChange} authMap={selectedRun.authMap || {}} readOnly={!isAdmin} />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="content-header">
                <h1 className="content-header__title">Payroll Runs</h1>
                <div className="content-header__actions">
                    {isAdmin && <ActivityButton entityType="PayrollRun" />}
                    {!showArchived && isAdmin && (
                        <button className="archive-toggle" onClick={() => setShowArchived(true)}>
                            {Icons.archive} View Archived
                        </button>
                    )}
                    {!showArchived && isAdmin && (
                        <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'upload' })}>
                            {Icons.upload} New Run
                        </button>
                    )}
                </div>
            </div>
            <div className="page-content">
                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived payroll runs. Click "Restore" to bring items back.</span>
                        {runs.length > 0 && (
                            <button className="btn btn--danger btn--sm" onClick={() => setModal({ type: 'confirmBulkPermanentDelete' })}>
                                {Icons.trash} Delete All Archived
                            </button>
                        )}
                        <button className="btn btn--outline btn--sm" onClick={() => setShowArchived(false)}>
                            {Icons.chevronLeft} Back to Active
                        </button>
                    </div>
                )}
                {loading ? (
                    <p style={{ color: 'hsl(240 3.8% 46.1%)' }}>Loading…</p>
                ) : runs.length === 0 ? (
                    <p style={{ color: 'hsl(240 3.8% 46.1%)', fontStyle: 'italic' }}>No payroll runs yet. Upload an XLSX to get started.</p>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Run Name</th>
                                    <th>File</th>
                                    <th>Period</th>
                                    <th>Visits</th>
                                    <th>Payable Units</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map((run) => (
                                    <tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => handleRunClick(run)}>
                                        <td style={{ fontWeight: 500 }}>{run.name}</td>
                                        <td style={{ fontSize: 12, color: 'hsl(240 3.8% 46.1%)' }}>{run.fileName}</td>
                                        <td style={{ fontSize: 12 }}>
                                            {run.periodStart ? fmtDate(run.periodStart) : '—'}
                                            {run.periodEnd   ? ` – ${fmtDate(run.periodEnd)}` : ''}
                                        </td>
                                        <td>{run.totalVisits}</td>
                                        <td>{run.totalPayable}</td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                                fontSize: 11, fontWeight: 600,
                                                background: run.status === 'done' ? 'hsl(142 76% 96%)' : run.status === 'error' ? 'hsl(0 93% 97%)' : 'hsl(38 100% 96%)',
                                                color:      run.status === 'done' ? 'hsl(142 71% 35%)' : run.status === 'error' ? 'hsl(0 84% 45%)' : 'hsl(38 92% 35%)',
                                            }}>
                                                {run.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 12 }}>{fmtDate(run.createdAt)}</td>
                                        {isAdmin && (
                                        <td onClick={(e) => e.stopPropagation()}>
                                            {showArchived ? (<>
                                                <button className="btn btn--restore" onClick={() => handleRestore(run)} title="Restore">
                                                    {Icons.rotateCcw} Restore
                                                </button>
                                                <button
                                                    className="btn btn--danger-ghost btn--icon"
                                                    title="Delete Forever"
                                                    onClick={() => setModal({ type: 'confirmPermanentDelete', run })}
                                                >
                                                    {Icons.trash}
                                                </button>
                                            </>) : (
                                                <button
                                                    className="btn btn--danger-ghost btn--icon"
                                                    title="Delete run"
                                                    onClick={() => setModal({ type: 'confirmDelete', run })}
                                                >
                                                    {Icons.trash}
                                                </button>
                                            )}
                                        </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal?.type === 'upload' && (
                <PayrollUploadModal onUpload={handleUpload} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Archive Payroll Run"
                    message={`This will archive the run "${modal.run.name}". You can restore it later from the archived view.`}
                    onConfirm={() => handleDelete(modal.run)}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === 'confirmPermanentDelete' && (
                <ConfirmModal
                    title="Permanently Delete Payroll Run"
                    message={`This will permanently delete the run "${modal.run.name}" and all ${modal.run.totalVisits} visit records. This action cannot be undone.`}
                    onConfirm={() => handlePermanentDelete(modal.run)}
                    onClose={() => setModal(null)}
                    confirmLabel="Delete Forever"
                />
            )}
            {modal?.type === 'confirmBulkPermanentDelete' && (
                <ConfirmModal
                    title="Delete All Archived Payroll Runs"
                    message={`Permanently delete all ${runs.length} archived payroll run(s) and their visit records? This action cannot be undone.`}
                    onConfirm={handleBulkPermanentDelete}
                    onClose={() => setModal(null)}
                    confirmLabel="Delete All Forever"
                />
            )}
        </div>
    );
}

export default PayrollPage;
