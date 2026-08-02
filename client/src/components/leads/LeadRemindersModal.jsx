import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import LogContactForm from './LogContactForm';
import * as api from '../../api';
import { LEAD_CONTACT_OUTCOMES } from '../../utils/leadConstants';

const BUCKETS = [
  { key: 'due',           title: 'Follow-ups due',  hint: 'Promised call-backs that are due or overdue' },
  { key: 'stale_soon',    title: 'Going stale soon', hint: 'No activity in a while — about to auto-archive' },
  { key: 'new_untouched', title: 'New & untouched', hint: 'Fresh leads with no contact logged yet' },
  { key: 'stuck',         title: 'Stuck in a stage', hint: 'Sitting in the same stage too long' },
];

const EMPTY_BUCKETS = { due: [], stale_soon: [], new_untouched: [], stuck: [] };

function outcomeLabel(outcomeId) {
  const found = LEAD_CONTACT_OUTCOMES.find((o) => o.id === outcomeId);
  return found ? found.label : outcomeId;
}

export default function LeadRemindersModal({ open, onClose, onOpenLead, onContactLogged }) {
  const [buckets, setBuckets] = useState(EMPTY_BUCKETS);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null); // leadId currently logging
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getLeadReminders()
      .then((data) => setBuckets({ ...EMPTY_BUCKETS, ...data }))
      .catch(() => setBuckets(EMPTY_BUCKETS))
      .finally(() => setLoading(false));
  }, [open]);

  function removeLead(leadId) {
    setBuckets((prev) => {
      const next = {};
      for (const k of Object.keys(prev)) next[k] = prev[k].filter((l) => l.id !== leadId);
      return next;
    });
  }

  const total = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);

  if (!open) return null;

  return (
    <Modal onClose={onClose} wide>
      <h2 className="modal__title">Good morning — leads needing attention</h2>
      {loading ? (
        <p>Loading…</p>
      ) : total === 0 ? (
        <p className="lead-reminders__empty">You're all caught up 🎉</p>
      ) : (
        <div className="lead-reminders">
          {BUCKETS.map(({ key, title, hint }) => {
            const rows = buckets[key];
            if (!rows.length) return null;
            return (
              <section key={key} className="lead-reminders__bucket">
                <h3 className="lead-reminders__bucket-title">
                  {title} <span className="lead-reminders__count">{rows.length}</span>
                </h3>
                <p className="lead-reminders__hint">{hint}</p>
                <ul className="lead-reminders__list">
                  {rows.map((l) => (
                    <li key={l.id} className="lead-reminders__row">
                      <div className="lead-reminders__who">
                        <strong>{l.firstName} {l.lastName}</strong>
                        <span>{l.phone}</span>
                        {l.lastContact && (
                          <em className="lead-reminders__last-contact">
                            last: {outcomeLabel(l.lastContact.outcome)}
                          </em>
                        )}
                      </div>
                      <div className="lead-reminders__actions">
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => setActiveLog(activeLog === l.id ? null : l.id)}
                        >
                          {activeLog === l.id ? 'Close' : 'Log follow-up'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          onClick={() => onOpenLead?.(l.id)}
                        >
                          Open
                        </button>
                      </div>
                      {activeLog === l.id && (
                        <div className="lead-reminders__inline-form">
                          <LogContactForm
                            busy={busy}
                            onCancel={() => setActiveLog(null)}
                            onSubmit={async (values) => {
                              setBusy(true);
                              try {
                                const contact = await api.createLeadContact(l.id, values);
                                removeLead(l.id);
                                setActiveLog(null);
                                onContactLogged?.(l.id, contact);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
