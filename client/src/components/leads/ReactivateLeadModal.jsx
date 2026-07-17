import { useState } from 'react';
import Modal from '../common/Modal';
import Icons from '../common/Icons';
import { LEAD_COLUMNS } from '../../utils/leadConstants';

// Modal for choosing which board column a dormant lead should reactivate into.
// Only the four non-archived columns are offered (archived would be a no-op).
//
// Props:
//   lead         : the dormant lead being reactivated (used for the title/name)
//   onClose      : () => void
//   onConfirmed  : (updatedLead) => void       — parent handles state + toast
//   reactivateLead : async (id, columnId) => updatedLead  (usually api.reactivateLead)
export default function ReactivateLeadModal({ lead, onClose, onConfirmed, reactivateLead }) {
    const columns = LEAD_COLUMNS.filter((c) => c.id !== 'archived');
    const [columnId, setColumnId] = useState('new');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!lead) return null;
    const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'this lead';

    async function submit() {
        setSubmitting(true);
        setError('');
        try {
            const updated = await reactivateLead(lead.id, columnId);
            onConfirmed(updated);
        } catch (err) {
            setError(err.message || 'Failed to reactivate lead');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal onClose={onClose}>
            <div className="reactivate-modal">
                <div className="reactivate-modal__header">
                    <div className="reactivate-modal__icon" aria-hidden="true">{Icons.rotateCcw}</div>
                    <div>
                        <h2 className="reactivate-modal__title">Reactivate {name}</h2>
                        <p className="reactivate-modal__subtitle">
                            Choose the column this lead should return to on the board.
                        </p>
                    </div>
                </div>

                <div className="reactivate-modal__options" role="radiogroup" aria-label="Target column">
                    {columns.map((col) => {
                        const active = columnId === col.id;
                        return (
                            <label
                                key={col.id}
                                className={`reactivate-modal__option${active ? ' reactivate-modal__option--active' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="reactivate-column"
                                    value={col.id}
                                    checked={active}
                                    onChange={() => setColumnId(col.id)}
                                />
                                <span className="reactivate-modal__option-label">{col.label}</span>
                            </label>
                        );
                    })}
                </div>

                {error && <div className="reactivate-modal__error" role="alert">{error}</div>}

                <div className="reactivate-modal__actions">
                    <button type="button" className="btn btn--outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn--primary" onClick={submit} disabled={submitting}>
                        {submitting ? 'Reactivating…' : 'Reactivate'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
