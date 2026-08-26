// Generic pill-style tab switcher. Reuses the `.lead-view-switcher` CSS so it
// looks identical to the Leads page view switcher, but is decoupled from Leads
// (no LEAD_VIEWS dependency) so any page can use it. Tabs that carry a numeric
// signal render a small badge next to the label (a count of 0 renders no badge).
//
// Props:
//   tabs      : [{ id, label }]
//   active    : current tab id
//   counts    : { [id]: number }  — optional badge numbers
//   onChange  : (id) => void
//   ariaLabel : accessible label for the tablist (default 'Views')
export default function PillTabs({ tabs = [], active, counts = {}, onChange, ariaLabel = 'Views' }) {
    return (
        <div className="lead-view-switcher" role="tablist" aria-label={ariaLabel}>
            {tabs.map((t) => {
                const isActive = active === t.id;
                const badgeCount = counts[t.id];
                const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`lead-view-switcher__tab${isActive ? ' lead-view-switcher__tab--active' : ''}`}
                        onClick={() => onChange(t.id)}
                    >
                        {t.label}
                        {showBadge && (
                            <span
                                className={`lead-view-switcher__badge lead-view-switcher__badge--${t.id}`}
                                aria-label={`${badgeCount} ${t.label}`}
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
