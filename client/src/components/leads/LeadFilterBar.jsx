import { useMemo } from 'react';
import Icons from '../common/Icons';
import { MONTH_LABELS, deriveDateFilterOptions } from '../../utils/leadConstants';

// Persistent filter row for the Board and List views.
// Design: reuses the app's canonical `.ts-filter-bar` pattern (see
// TimesheetsListPage) — a card-well row with labeled form fields for consistency
// with the rest of the app. All styling is design-system tokens (hsl(var(--…))).
//
// Props:
//   leads          : array — the full active-leads set (used to derive year/month
//                    options with "has data" indicators)
//   year           : 'all' | number
//   month          : 'all' | 0..11
//   caseType       : 'all' | 'initial' | 'transfer' | 'private'
//   search         : string
//   onChange       : (patch) => void       — merges into the parent's filter state
//   onReset        : () => void
//   caseTypeOptions: [{ id, label }]        — the parent's canonical list
export default function LeadFilterBar({
    leads,
    year,
    month,
    caseType,
    search,
    onChange,
    onReset,
    caseTypeOptions,
}) {
    const { years, monthsByYear } = useMemo(() => deriveDateFilterOptions(leads), [leads]);

    // Which months have at least one lead in the currently-selected year.
    // When "All Years" is selected, mark any month that has data in any year.
    const monthsWithData = useMemo(() => {
        if (year === 'all') {
            const s = new Set();
            for (const set of monthsByYear.values()) for (const m of set) s.add(m);
            return s;
        }
        return monthsByYear.get(year) || new Set();
    }, [year, monthsByYear]);

    const hasActiveFilter =
        year !== 'all' || month !== 'all' || caseType !== 'all' || (search && search.trim().length > 0);

    return (
        <div className="leads-filter-bar-wrap">
            <div className="ts-filter-bar leads-filter-bar">
                {/* Year */}
                <div className="ts-filter-bar__field">
                    <label htmlFor="lead-filter-year">Year</label>
                    <select
                        id="lead-filter-year"
                        value={year}
                        onChange={(e) => {
                            const v = e.target.value;
                            onChange({ year: v === 'all' ? 'all' : Number(v) });
                        }}
                    >
                        <option value="all">All Years</option>
                        {years.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                {/* Month */}
                <div className="ts-filter-bar__field">
                    <label htmlFor="lead-filter-month">Month</label>
                    <select
                        id="lead-filter-month"
                        value={month}
                        onChange={(e) => {
                            const v = e.target.value;
                            onChange({ month: v === 'all' ? 'all' : Number(v) });
                        }}
                    >
                        <option value="all">All Months</option>
                        {MONTH_LABELS.map((label, idx) => (
                            <option key={label} value={idx}>
                                {label}{monthsWithData.has(idx) ? ' •' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Case type */}
                <div className="ts-filter-bar__field">
                    <label htmlFor="lead-filter-case-type">Case Type</label>
                    <select
                        id="lead-filter-case-type"
                        value={caseType}
                        onChange={(e) => onChange({ caseType: e.target.value })}
                    >
                        {caseTypeOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.id === 'all' ? 'All Case Types' : t.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Search */}
                <div className="ts-filter-bar__field leads-filter-bar__search-field">
                    <label htmlFor="lead-filter-search">Search</label>
                    <div className="leads-filter-bar__search-wrap">
                        <span className="leads-filter-bar__search-icon" aria-hidden="true">{Icons.search}</span>
                        <input
                            id="lead-filter-search"
                            type="text"
                            placeholder="Name, phone, insurance…"
                            value={search}
                            onChange={(e) => onChange({ search: e.target.value })}
                        />
                    </div>
                </div>

                <div className="ts-filter-bar__actions">
                    <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={onReset}
                        disabled={!hasActiveFilter}
                        title="Clear all filters"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Active-filter pill strip — visible only when at least one filter is on */}
            {hasActiveFilter && (
                <div className="leads-filter-bar__active">
                    <span className="leads-filter-bar__active-label">Active filters:</span>
                    {year !== 'all' && (
                        <ActivePill label={`Year: ${year}`} onClear={() => onChange({ year: 'all' })} />
                    )}
                    {month !== 'all' && (
                        <ActivePill label={`Month: ${MONTH_LABELS[month]}`} onClear={() => onChange({ month: 'all' })} />
                    )}
                    {caseType !== 'all' && (
                        <ActivePill
                            label={`Type: ${caseTypeOptions.find((t) => t.id === caseType)?.label || caseType}`}
                            onClear={() => onChange({ caseType: 'all' })}
                        />
                    )}
                    {search && search.trim().length > 0 && (
                        <ActivePill label={`Search: "${search.trim()}"`} onClear={() => onChange({ search: '' })} />
                    )}
                </div>
            )}
        </div>
    );
}

function ActivePill({ label, onClear }) {
    return (
        <button
            type="button"
            className="chip chip--on leads-filter-bar__active-pill"
            onClick={onClear}
            title="Remove this filter"
        >
            {label}
            <span className="leads-filter-bar__active-x" aria-hidden="true">{Icons.x}</span>
        </button>
    );
}
