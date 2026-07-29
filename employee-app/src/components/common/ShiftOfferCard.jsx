import { hhmm12 } from '../../utils/timeFormat';

/**
 * A replacement shift offered to this caregiver, with Accept / Decline.
 *
 * Builds on the existing .shift-card foundation so an offer reads as the same
 * kind of object as the shifts already on the home screen — it is one, just
 * not theirs yet. The warning-toned header is what distinguishes it: this
 * needs a decision, and the window is closing.
 */
export default function ShiftOfferCard({ offer, onRespond, responding = false }) {
  if (!offer) return null;

  const date = new Date(offer.shiftDate);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const dayLabel = isToday ? 'Today'
    : isTomorrow ? 'Tomorrow'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(offer.address || '')}`;

  return (
    <div
      className="shift-card"
      style={{
        marginBottom: 16,
        borderLeftColor: 'hsl(var(--warning))',
        background: 'hsl(var(--warning) / 0.04)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'hsl(var(--warning))',
        }}>
          Shift available
        </span>
        {/* A time-boxed offer has to say so, or waiting silently costs them
            the shift. */}
        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          {formatRemaining(offer.expiresAt)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="shift-card__client" style={{ fontSize: 18 }}>{offer.clientName}</span>
        {offer.serviceCode && <span className="badge">{offer.serviceCode}</span>}
      </div>

      <p className="shift-card__time">
        {dayLabel} {hhmm12(offer.startTime)} – {hhmm12(offer.endTime)}
      </p>

      {offer.address && (
        <a href={mapsUrl} target="_blank" rel="noopener" className="shift-card__address">
          {offer.address}
        </a>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {/* Stable aria-labels: the visible text changes to "Sending…" while a
            response is in flight, and a control whose accessible name shifts
            mid-interaction is hard for assistive tech (and tests) to track. */}
        <button
          type="button"
          className="btn btn--primary"
          style={{ flex: 1 }}
          aria-label="Accept shift"
          disabled={responding}
          onClick={() => onRespond?.(offer.id, 'accept')}
        >
          {responding ? 'Sending…' : 'Accept'}
        </button>
        <button
          type="button"
          className="btn"
          style={{ flex: 1 }}
          aria-label="Decline shift"
          disabled={responding}
          onClick={() => onRespond?.(offer.id, 'decline')}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

/** "9 min left" / "less than a minute left" / "expired". */
function formatRemaining(expiresAt) {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Less than a minute left';
  return `${mins} min left`;
}
