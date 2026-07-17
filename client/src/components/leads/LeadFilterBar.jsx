import { useMemo } from 'react';
import Icons from '../common/Icons';
import { MONTH_LABELS, deriveDateFilterOptions } from '../../utils/leadConstants';

// Persistent filter row for the Board and List views.
// Filters are applied client-side to the leads array on LeadsPage.
//
// Props:
//   leads          : array — the full active-leads set (used to derive year/month
//                    options with "has data" indicators; not filtered by this
//                    component itself)
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
        <div className="leads-filter-bar">
            <div className="leads-filter-bar__row">
                {/* Year */}
                <div className="leads-filter-bar__group">
                    <label className="leads-filter-bar__label" htmlFor="lead-filter-year">
                        {Icons.calendar}
                        Year
                    </label>
                    <select
                        id="lead-filter-year"
                        className="finput leads-filter-bar__select"
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

                {/* Month pills */}
                <div className="leads-filter-bar__months">
                    <button
                        type="button"
                        className={`chip${month === 'all' ? ' chip--on' : ''}`}
                        onClick={() => onChange({ month: 'all' })}
                    >
                        All
                    </button>
                    {MONTH_LABELS.map((label, idx) => {
                        const active = month === idx;
                        const hasData = monthsWithData.has(idx);
                        return (
                            <button
                                key={label}
                                type="button"
                                className={`chip leads-filter-bar__month${active ? ' chip--on' : ''}${hasData ? ' leads-filter-bar__month--has-data' : ''}`}
                                onClick={() => onChange({ month: active ? 'all' : idx })}
                                title={hasData ? `${label} has leads` : `${label} — no leads`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Case type chips */}
                <div className="leads-filter-bar__case-types">
                    {caseTypeOptions.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className={`chip${caseType === t.id ? ' chip--on' : ''}`}
                            onClick={() => onChange({ caseType: t.id })}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="leads-filter-bar__search">
                    <span className="leads-filter-bar__search-icon" aria-hidden="true">{Icons.search}</span>
                    <input
                        type="text"
                        className="finput leads-filter-bar__search-input"
                        placeholder="Search by name, phone, insurance…"
                        value={search}
                        onChange={(e) => onChange({ search: e.target.value })}
                    />
                </div>

                {/* Reset */}
                <button
                    type="button"
                    className="btn btn--outline btn--xs"
                    onClick={onReset}
                    disabled={!hasActiveFilter}
                    title="Clear all filters"
                >
                    Reset
                </button>
            </div>

            {/* Active filter pill strip — visible only when filters are active */}
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
