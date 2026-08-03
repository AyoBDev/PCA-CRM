import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import LogContactForm from './LogContactForm';
import * as api from '../../api';
import { LEAD_CONTACT_OUTCOMES } from '../../utils/leadConstants';

// tone drives the accent color per bucket (see .lead-reminders__bucket--<tone> in index.css)
const BUCKETS = [
  { key: 'due',           title: 'Follow-ups due',   tone: 'danger',  hint: 'Promised call-backs that are due or overdue' },
  { key: 'stale_soon',    title: 'Going stale soon',  tone: 'warning', hint: 'No activity in a while — about to auto-archive' },
  { key: 'new_untouched', title: 'New & untouched',   tone: 'info',    hint: 'Fresh leads with no contact logged yet' },
  { key: 'stuck',         title: 'Stuck in a stage',  tone: 'neutral', hint: 'Sitting in the same stage too long' },
];

const EMPTY_BUCKETS = { due: [], stale_soon: [], new_untouched: [], stuck: [] };

function outcomeMeta(outcomeId) {
  return LEAD_CONTACT_OUTCOMES.find((o) => o.id === outcomeId) || null;
}

export default function LeadRemindersModal({ open, onClose, onOpenLead, onContactLogged }) {
  const [buckets, setBuckets] = useState(EMPTY_BUCKETS);
  const [loading, setLoading] = useState(true);
  const [activeLog, setActiveLog] = useState(null); // leadId currently logging
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setActiveLog(null);
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
      <div className="lead-reminders__header">
        <h2 className="modal__title">Good morning — leads needing attention</h2>
        {!loading && total > 0 && (
          <p className="lead-reminders__subtitle">
            {total} {total === 1 ? 'lead needs' : 'leads need'} a follow-up today
          </p>
        )}
      </div>

      {loading ? (
        <p className="lead-reminders__loading">Loading…</p>
      ) : total === 0 ? (
        <div className="lead-reminders__empty">
          <span className="lead-reminders__empty-emoji">🎉</span>
          <p>You're all caught up. No leads need attention right now.</p>
        </div>
      ) : (
        <div className="lead-reminders">
          {BUCKETS.map(({ key, title, tone, hint }) => {
            const rows = buckets[key];
            if (!rows.length) return null;
            return (
              <section
                key={key}
                className={`lead-reminders__bucket lead-reminders__bucket--${tone}`}
              >
                <div className="lead-reminders__bucket-head">
                  <h3 className="lead-reminders__bucket-title">
                    {title}
                    <span className="lead-reminders__count">{rows.length}</span>
                  </h3>
                  <p className="lead-reminders__hint">{hint}</p>
                </div>

                <ul className="lead-reminders__list">
                  {rows.map((l) => {
                    const isLogging = activeLog === l.id;
                    const last = l.lastContact ? outcomeMeta(l.lastContact.outcome) : null;
                    return (
                      <li key={l.id} className="lead-reminders__row">
                        <div className="lead-reminders__row-main">
                          <div className="lead-reminders__who">
                            <strong className="lead-reminders__name">
                              {l.firstName} {l.lastName}
                            </strong>
                            {l.phone && (
                              <a
                                href={`tel:${l.phone}`}
                                className="lead-reminders__phone"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {l.phone}
                              </a>
                            )}
                            {l.lastContact && (
                              <span
                                className="lead-reminders__last-badge"
                                style={last ? { background: last.color } : undefined}
                              >
                                last: {last ? last.label : l.lastContact.outcome}
                              </span>
                            )}
                          </div>
                          <div className="lead-reminders__actions">
                            <button
                              type="button"
                              className={`btn btn--sm ${isLogging ? 'btn--ghost' : 'btn--primary'}`}
                              onClick={() => setActiveLog(isLogging ? null : l.id)}
                            >
                              {isLogging ? 'Close' : 'Log follow-up'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--sm btn--ghost"
                              onClick={() => onOpenLead?.(l.id)}
                            >
                              Open lead
                            </button>
                          </div>
                        </div>

                        {isLogging && (
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
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
