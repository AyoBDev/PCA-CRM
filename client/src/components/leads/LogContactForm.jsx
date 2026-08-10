import { useState } from 'react';
import { LEAD_CONTACT_OUTCOMES, LEAD_CONTACT_METHODS, isTerminalOutcome } from '../../utils/leadConstants';

export default function LogContactForm({ onSubmit, onCancel, busy = false }) {
  const [outcome, setOutcome] = useState('no_answer');
  const [method, setMethod] = useState('call');
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const needsDate = !isTerminalOutcome(outcome);
  const canSubmit = !busy && outcome && (!needsDate || followUpDate);

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ outcome, method, note, followUpDate });
  }

  return (
    <form className="log-contact-form" onSubmit={handleSubmit}>
      <div className="log-contact-form__row">
        <label>
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {LEAD_CONTACT_OUTCOMES.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {LEAD_CONTACT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What happened on this contact?" />
      </label>
      {needsDate && (
        <label>
          Next follow-up date <span className="log-contact-form__required">required</span>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </label>
      )}
      <div className="log-contact-form__actions">
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="btn btn--primary" disabled={!canSubmit}>Save follow-up</button>
      </div>
      {needsDate && !followUpDate && (
        <p className="log-contact-form__hint">Set the next follow-up date, or choose a closing outcome.</p>
      )}
    </form>
  );
}
