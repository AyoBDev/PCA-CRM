import { useMemo, useState } from 'react';
import Icons from '../common/Icons';
import OverflowMenu from '../common/OverflowMenu';
import { formatDate } from '../../utils/dates';
import { getInitials, getAvatarColor } from '../../utils/ui';
import { LEAD_CASE_TYPES, daysSince } from '../../utils/leadConstants';

// Dormant Archive — auto-archived leads with no activity for DORMANT_DAYS.
// Mirrors LeadListView exactly: same `.leads-list-view` shell, the canonical
// .data-table--sheet + .data-table--dark-header structure, the design-system
// name cell (avatar circle + name), and a single 3-dot actions menu. Filtering
// is driven by the shared LeadFilterBar on LeadsPage, so this component takes
// an already-filtered array (same contract as LeadListView).
//
// Props:
//   leads         : array (already filtered by LeadsPage)
//   onReactivate  : (lead) => void
export default function LeadDormantView({ leads, onReactivate }) {
    const [sort, setSort] = useState({ field: 'daysSince', dir: 'desc' });

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
                    <p className="empty-state__title">No dormant leads match your filters.</p>
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
                            <Th field="name"          label="Name"        sort={sort} onClick={toggleSort} />
                            <Th field="caseType"      label="Case Type"   sort={sort} onClick={toggleSort} />
                            <Th field="insuranceType" label="Insurance"   sort={sort} onClick={toggleSort} />
                            <Th field="phone"         label="Phone"       sort={sort} onClick={toggleSort} />
                            <Th field="createdAt"     label="Date Added"  sort={sort} onClick={toggleSort} />
                            <Th field="daysSince"     label="Days Since"  sort={sort} onClick={toggleSort} />
                            <th scope="col" style={{ width: 64 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((l) => {
                            const ct = LEAD_CASE_TYPES[l.caseType] || LEAD_CASE_TYPES.initial;
                            const days = daysSince(l.createdAt);
                            const name = fullName(l);
                            return (
                                <tr key={l.id}>
                                    <td>
                                        <div className="lead-list-name">
                                            <div className="client-avatar" style={{ background: getAvatarColor(name) }}>{getInitials(name)}</div>
                                            <div className="lead-list-name__text">{name}</div>
                                        </div>
                                    </td>
                                    <td><span className={`tag ${ct.tagClass}`}>{ct.label}</span></td>
                                    <td>{l.insuranceType || '—'}</td>
                                    <td>{l.phone || '—'}</td>
                                    <td>{formatDate(l.createdAt)}</td>
                                    <td>{days} day{days === 1 ? '' : 's'}</td>
                                    <td>
                                        <div className="lead-list-actions">
                                            <OverflowMenu
                                                items={[
                                                    { label: 'Reactivate', icon: Icons.rotateCcw, action: () => onReactivate(l) },
                                                ]}
                                            />
                                        </div>
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
        case 'phone':         return (l.phone || '').toLowerCase();
        case 'createdAt':     return l.createdAt ? new Date(l.createdAt).getTime() : 0;
        case 'daysSince':     return daysSince(l.createdAt);
        case 'insuranceType': return (l.insuranceType || '').toLowerCase();
        case 'caseType':      return l.caseType || '';
        default:              return '';
    }
}
