import { useMemo, useState } from 'react';
import Icons from '../common/Icons';
import { formatDate } from '../../utils/dates';
import { LEAD_CASE_TYPES, DORMANT_DAYS, daysSince } from '../../utils/leadConstants';

// Flat sortable table for the Dormant Archive — auto-archived leads older than
// DORMANT_DAYS with no activity. Own search box (independent of the main filter
// bar) so intake coordinators can locate a returning caller in one keystroke.
//
// Props:
//   leads         : the fetched dormant leads
//   onReactivate  : (lead) => void
export default function LeadDormantView({ leads, onReactivate }) {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ field: 'daysSince', dir: 'desc' });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return leads;
        return leads.filter((l) => {
            const hay = [
                `${l.firstName || ''} ${l.lastName || ''}`,
                l.phone,
                l.alternatePhone,
                l.insuranceType,
                l.medicaidId,
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [leads, search]);

    const sorted = useMemo(() => {
        const rows = [...filtered];
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
    }, [filtered, sort]);

    const toggleSort = (field) => {
        setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));
    };

    return (
        <div className="leads-dormant-view">
            <div className="leads-dormant-view__banner">
                <span className="leads-dormant-view__banner-icon" aria-hidden="true">{Icons.archive}</span>
                <div>
                    <p className="leads-dormant-view__banner-title">Dormant Archive</p>
                    <p className="leads-dormant-view__banner-body">
                        Leads with no activity for {DORMANT_DAYS} days move here automatically. They are never deleted.
                        Use <b>Reactivate</b> to move a lead back to the active board.
                    </p>
                </div>
                <div className="leads-dormant-view__count">
                    {leads.length} lead{leads.length === 1 ? '' : 's'}
                </div>
            </div>

            <div className="leads-dormant-view__search">
                <span className="leads-dormant-view__search-icon" aria-hidden="true">{Icons.search}</span>
                <input
                    type="text"
                    className="finput leads-dormant-view__search-input"
                    placeholder="Search dormant leads by name, phone, or insurance…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <span className="leads-dormant-view__search-count">
                        {sorted.length} match{sorted.length === 1 ? '' : 'es'}
                    </span>
                )}
            </div>

            {sorted.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 24px' }}>
                    <p className="empty-state__title">
                        {leads.length === 0 ? 'No dormant leads.' : 'No dormant leads match your search.'}
                    </p>
                </div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table data-table--sheet data-table--dark-header">
                        <thead>
                            <tr>
                                <Th field="name"          label="Name"        sort={sort} onClick={toggleSort} />
                                <Th field="phone"         label="Phone"       sort={sort} onClick={toggleSort} />
                                <Th field="createdAt"     label="Date Added"  sort={sort} onClick={toggleSort} />
                                <Th field="daysSince"     label="Days Since"  sort={sort} onClick={toggleSort} />
                                <Th field="insuranceType" label="Insurance"   sort={sort} onClick={toggleSort} />
                                <Th field="caseType"      label="Type"        sort={sort} onClick={toggleSort} />
                                <th scope="col" style={{ width: 140 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((l) => {
                                const ct = LEAD_CASE_TYPES[l.caseType] || LEAD_CASE_TYPES.initial;
                                const days = daysSince(l.createdAt);
                                return (
                                    <tr key={l.id}>
                                        <td>{fullName(l)}</td>
                                        <td>{l.phone || '—'}</td>
                                        <td>{formatDate(l.createdAt)}</td>
                                        <td>{days} days</td>
                                        <td>{l.insuranceType || '—'}</td>
                                        <td><span className={`tag ${ct.tagClass}`}>{ct.label}</span></td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn--primary btn--xs"
                                                onClick={() => onReactivate(l)}
                                            >
                                                Reactivate
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
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
