import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from '../common/Icons';
import { formatDate } from '../../utils/dates';
import { LEAD_CASE_TYPES, daysSince } from '../../utils/leadConstants';

// Flat sortable table for leads that became active clients. Shows a link to the
// created Client's detail page (via convertedClientId) so intake coordinators
// can jump straight to the client profile.
//
// Props:
//   leads : array (all leads where status='converted', server-sorted by
//           convertedAt desc; this component adds client-side search + sort)
export default function LeadConvertedView({ leads }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ field: 'convertedAt', dir: 'desc' });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return leads;
        return leads.filter((l) => {
            const hay = [
                `${l.firstName || ''} ${l.lastName || ''}`,
                l.phone,
                l.insuranceType,
                l.referralSource,
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
        <div className="leads-converted-view">
            <div className="leads-converted-view__banner">
                <span className="leads-converted-view__banner-icon" aria-hidden="true">{Icons.checkCircle}</span>
                <div>
                    <p className="leads-converted-view__banner-title">Recently Converted</p>
                    <p className="leads-converted-view__banner-body">
                        Leads that became active clients. Click a name to open the client profile.
                    </p>
                </div>
                <div className="leads-converted-view__count">
                    {leads.length} lead{leads.length === 1 ? '' : 's'}
                </div>
            </div>

            <div className="leads-converted-view__search">
                <span className="leads-converted-view__search-icon" aria-hidden="true">{Icons.search}</span>
                <input
                    type="text"
                    className="finput leads-converted-view__search-input"
                    placeholder="Search converted leads by name, phone, or insurance…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <span className="leads-converted-view__search-count">
                        {sorted.length} match{sorted.length === 1 ? '' : 'es'}
                    </span>
                )}
            </div>

            {sorted.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 24px' }}>
                    <p className="empty-state__title">
                        {leads.length === 0 ? 'No converted leads yet.' : 'No converted leads match your search.'}
                    </p>
                </div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table data-table--sheet data-table--dark-header">
                        <thead>
                            <tr>
                                <Th field="name"          label="Name"          sort={sort} onClick={toggleSort} />
                                <Th field="caseType"      label="Case Type"     sort={sort} onClick={toggleSort} />
                                <Th field="insuranceType" label="Insurance"     sort={sort} onClick={toggleSort} />
                                <Th field="referralSource" label="Source"       sort={sort} onClick={toggleSort} />
                                <Th field="convertedAt"   label="Converted On"  sort={sort} onClick={toggleSort} />
                                <Th field="daysAgo"       label="Days Ago"      sort={sort} onClick={toggleSort} />
                                <th scope="col" style={{ width: 160 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((l) => {
                                const ct = LEAD_CASE_TYPES[l.caseType] || LEAD_CASE_TYPES.initial;
                                const days = l.convertedAt ? daysSince(l.convertedAt) : null;
                                const clientId = l.convertedClientId;
                                return (
                                    <tr key={l.id}>
                                        <td>
                                            {clientId ? (
                                                <button
                                                    type="button"
                                                    className="lead-list-name"
                                                    onClick={() => navigate(`/clients/${clientId}`)}
                                                >
                                                    {fullName(l)}
                                                </button>
                                            ) : (
                                                fullName(l)
                                            )}
                                        </td>
                                        <td><span className={`tag ${ct.tagClass}`}>{ct.label}</span></td>
                                        <td>{l.insuranceType || '—'}</td>
                                        <td>{l.referralSource || '—'}</td>
                                        <td>{l.convertedAt ? formatDate(l.convertedAt) : '—'}</td>
                                        <td>{days == null ? '—' : `${days} day${days === 1 ? '' : 's'} ago`}</td>
                                        <td>
                                            {clientId && (
                                                <button
                                                    type="button"
                                                    className="btn btn--primary btn--xs"
                                                    onClick={() => navigate(`/clients/${clientId}`)}
                                                >
                                                    View Client
                                                </button>
                                            )}
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
        case 'name':           return fullName(l).toLowerCase();
        case 'caseType':       return l.caseType || '';
        case 'insuranceType':  return (l.insuranceType || '').toLowerCase();
        case 'referralSource': return (l.referralSource || '').toLowerCase();
        case 'convertedAt':    return l.convertedAt ? new Date(l.convertedAt).getTime() : 0;
        case 'daysAgo':        return l.convertedAt ? daysSince(l.convertedAt) : 0;
        default:               return '';
    }
}
