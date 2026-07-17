import { LEAD_VIEWS } from '../../utils/leadConstants';

// Pill-style view switcher (Board / List / Dormant Archive) with an optional
// count badge on the Dormant tab so intake coordinators see the growing archive
// at a glance.
//
// Props:
//   view          : 'board' | 'list' | 'dormant'
//   dormantCount  : number | undefined
//   onChange      : (viewId) => void
export default function LeadViewSwitcher({ view, dormantCount, onChange }) {
    return (
        <div className="lead-view-switcher" role="tablist" aria-label="Lead views">
            {LEAD_VIEWS.map((v) => {
                const active = view === v.id;
                const showBadge = v.id === 'dormant' && typeof dormantCount === 'number' && dormantCount > 0;
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
                            <span className="lead-view-switcher__badge" aria-label={`${dormantCount} dormant leads`}>
                                {dormantCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
