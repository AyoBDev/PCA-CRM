import { useMemo, useState } from 'react';
import { formatDate } from '../../utils/dates';
import { getInitials, getAvatarColor } from '../../utils/ui';
import { LEAD_CASE_TYPES, LEAD_STATUSES } from '../../utils/leadConstants';
import LeadActionsMenu from './LeadActionsMenu';

// Flat sortable table for the "List" view — active leads only, dense, keyboard-scannable.
// Uses the app's canonical .data-table--sheet + .data-table--dark-header structure
// (per CLAUDE.md UI Design System — Tables). The Name cell follows the design-system
// name-cell pattern (avatar circle + name) used on ClientsListPage.
//
// Props:
//   leads       : array (already filtered by LeadsPage)
//   onView      : (lead) => void
//   onArchive   : (lead) => void
//   onMove      : (leadId, columnId) => void
// Row actions use the shared LeadActionsMenu (same 3-dot menu as the Kanban card).
export default function LeadListView({ leads, onView, onArchive, onMove }) {
    const [sort, setSort] = useState({ field: 'createdAt', dir: 'desc' });

    const sorted = useMemo(() => {
        const rows = [...leads];
        rows.sort((a, b) => {
            const av = sortValue(a, sort.field);
            const bv = sortValue(b, sort.field);
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return sort.dir === 'asc' ? -1 : 1;
            if (av > bv) return sort.dir === 'asc' ? 1 : -1;
            return 0;
        });
        return rows;
    }, [leads, sort]);

    const toggleSort = (field) => {
        setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
    };

    if (!leads.length) {
        return (
            <div className="leads-list-view leads-list-view--empty">
                <div className="empty-state">
                    <p className="empty-state__title">No leads match your filters.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="leads-list-view">
            <div className="table-scroll">
                <table className="data-table data-table--sheet data-table--dark-header">
                    <thead>
                        <tr>
                            <Th field="name"          label="Name"          sort={sort} onClick={toggleSort} />
                            <Th field="caseType"      label="Case Type"     sort={sort} onClick={toggleSort} />
                            <Th field="insuranceType" label="Insurance"     sort={sort} onClick={toggleSort} />
                            <Th field="referralSource" label="Source"       sort={sort} onClick={toggleSort} />
                            <Th field="assignedTo"    label="Assigned To"   sort={sort} onClick={toggleSort} />
                            <Th field="status"        label="Status"        sort={sort} onClick={toggleSort} />
                            <Th field="followUpDate"  label="Follow-up"     sort={sort} onClick={toggleSort} />
                            <Th field="createdAt"     label="Added"         sort={sort} onClick={toggleSort} />
                            <th scope="col" style={{ width: 60, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((l) => {
                            const ct = LEAD_CASE_TYPES[l.caseType] || LEAD_CASE_TYPES.initial;
                            const st = LEAD_STATUSES.find((s) => s.id === l.status);
                            const name = fullName(l);
                            return (
                                <tr key={l.id}>
                                    <td style={{ cursor: 'pointer' }} onClick={() => onView(l)}>
                                        <div className="lead-list-name">
                                            <div className="client-avatar" style={{ background: getAvatarColor(name) }}>{getInitials(name)}</div>
                                            <div className="lead-list-name__text">{name}</div>
                                        </div>
                                    </td>
                                    <td><span className={`tag ${ct.tagClass}`}>{ct.label}</span></td>
                                    <td>{l.insuranceType || '—'}</td>
                                    <td>{l.referralSource || '—'}</td>
                                    <td>{l.assignedTo || '—'}</td>
                                    <td>
                                        {st ? (
                                            <span className="lead-list-status">
                                                <span className="lead-list-status__dot" style={{ background: st.dot }} aria-hidden="true" />
                                                {st.label}
                                            </span>
                                        ) : l.status}
                                    </td>
                                    <td>{l.followUpDate ? formatDate(l.followUpDate) : '—'}</td>
                                    <td>{formatDate(l.createdAt)}</td>
                                    <td className="lead-list-actions-cell">
                                        <LeadActionsMenu
                                            lead={l}
                                            onView={onView}
                                            onMove={onMove}
                                            onArchive={onArchive}
                                            fixedPanel
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Th({ field, label, sort, onClick }) {
    const active = sort.field === field;
    return (
        <th scope="col" onClick={() => onClick(field)} style={{ cursor: 'pointer' }}>
            <span className="th-content">
                {label}
                <span className={`th-sort${active ? ' th-sort--active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                        {active && sort.dir === 'asc' ? (
                            <path d="M7 9l5-5 5 5" />
                        ) : active && sort.dir === 'desc' ? (
                            <path d="M7 15l5 5 5-5" />
                        ) : (
                            <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
                        )}
                    </svg>
                </span>
            </span>
        </th>
    );
}

function fullName(l) {
    return `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Unnamed lead';
}

function sortValue(l, field) {
    switch (field) {
        case 'name':          return fullName(l).toLowerCase();
        case 'caseType':      return l.caseType || '';
        case 'insuranceType': return (l.insuranceType || '').toLowerCase();
        case 'referralSource': return (l.referralSource || '').toLowerCase();
        case 'assignedTo':    return (l.assignedTo || '').toLowerCase();
        case 'status':        return l.status || '';
        case 'followUpDate':  return l.followUpDate ? new Date(l.followUpDate).getTime() : null;
        case 'createdAt':     return l.createdAt ? new Date(l.createdAt).getTime() : 0;
        default:              return '';
    }
}
