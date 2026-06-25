export default function AvailabilityDayRow({ day, value, onChange }) {
  return (
    <div className={`availability-day-row ${!value.on ? 'availability-day-row--off' : ''}`}>
      <label className="availability-day-row__toggle">
        <input
          type="checkbox"
          checked={!!value.on}
          onChange={() => onChange({ on: !value.on, in: value.on ? '' : (value.in || '09:00'), out: value.on ? '' : (value.out || '17:00') })}
        />
        <span>{day}</span>
      </label>
      {value.on && (
        <div className="availability-day-row__times">
          <input type="time" value={value.in || ''} onChange={e => onChange({ ...value, in: e.target.value })} />
          <span>to</span>
          <input type="time" value={value.out || ''} onChange={e => onChange({ ...value, out: e.target.value })} />
        </div>
      )}
    </div>
  );
}
