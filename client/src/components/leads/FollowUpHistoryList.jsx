import { LEAD_CONTACT_OUTCOMES, LEAD_CONTACT_METHODS } from '../../utils/leadConstants';
import { formatDate } from '../../utils/dates';

const OUTCOME_BY_ID = Object.fromEntries(LEAD_CONTACT_OUTCOMES.map((o) => [o.id, o]));
const METHOD_ICONS = { call: '📞', text: '💬', email: '✉️', in_person: '🤝' };
const METHOD_BY_ID = Object.fromEntries(
    LEAD_CONTACT_METHODS.map((m) => [m.id, { label: m.label, icon: METHOD_ICONS[m.id] || '•' }])
);

/**
 * Read-only follow-up contact timeline. Shared by the lead detail modal and the
 * client detail page (for clients that were converted from a lead), so the
 * history is rendered identically in both places.
 */
export default function FollowUpHistoryList({ contacts, intakeNote, emptyText = 'No follow-ups logged yet.' }) {
    return (
        <>
            {intakeNote ? (
                <p className="lead-history__intake"><strong>Intake note:</strong> {intakeNote}</p>
            ) : null}

            {(!contacts || contacts.length === 0) ? (
                <p className="lead-history__empty">{emptyText}</p>
            ) : (
                <ul className="lead-history__list">
                    {contacts.map((c) => {
                        const meta = OUTCOME_BY_ID[c.outcome] || { label: c.outcome || 'Unknown', color: '#94a3b8' };
                        const methodMeta = METHOD_BY_ID[c.method] || { label: c.method, icon: '•' };
                        return (
                            <li key={c.id} className="lead-history__item">
                                <div className="lead-history__item-head">
                                    <span className="lead-history__badge" style={{ background: meta.color }}>{meta.label}</span>
                                    <span className="lead-history__method">
                                        <span className="lead-history__method-icon" aria-hidden="true">{methodMeta.icon}</span>
                                        {methodMeta.label}
                                    </span>
                                    <span className="lead-history__time">
                                        {new Date(c.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                </div>
                                {c.note && <p className="lead-history__note">{c.note}</p>}
                                <div className="lead-history__foot">
                                    <span className="lead-history__by">
                                        <span className="lead-history__by-label">Logged by</span> {c.createdBy || 'Unknown'}
                                    </span>
                                    {c.followUpDate && (
                                        <span className="lead-history__next">
                                            Next follow-up: <strong>{formatDate(c.followUpDate)}</strong>
                                        </span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}
