import { LEAD_VIEWS } from '../../utils/leadConstants';

// Pill-style view switcher: Board / List / Recently Converted / Dormant Archive.
// The tabs that carry a numeric signal (Converted-this-month, Dormant count)
// render a small badge next to the label so intake coordinators see growth at a
// glance without switching views.
//
// Props:
//   view          : 'board' | 'list' | 'converted' | 'dormant'
//   counts        : { dormant?: number, converted?: number }  — optional badge numbers
//   onChange      : (viewId) => void
export default function LeadViewSwitcher({ view, counts = {}, onChange }) {
    return (
        <div className="lead-view-switcher" role="tablist" aria-label="Lead views">
            {LEAD_VIEWS.map((v) => {
                const active = view === v.id;
                const badgeCount = counts[v.id];
                const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
                return (
                    <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`lead-view-switcher__tab${active ? ' lead-view-switcher__tab--active' : ''}`}
                        onClick={() => onChange(v.id)}
                    >
                        {v.label}
                        {showBadge && (
                            <span
                                className={`lead-view-switcher__badge lead-view-switcher__badge--${v.id}`}
                                aria-label={`${badgeCount} ${v.label} leads`}
                            >
                                {badgeCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
