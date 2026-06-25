import { hoursBetween } from '../../utils/hoursBetween';

function formatHours(n) {
  return Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function ScheduleWeekHeader({ shifts = [] }) {
  if (!shifts.length) {
    return (
      <div className="schedule-week-header">
        <div className="schedule-week-header__total">No shifts this week</div>
      </div>
    );
  }
  const byClient = new Map();
  let totalHours = 0;
  for (const s of shifts) {
    const h = hoursBetween(s.startTime, s.endTime);
    totalHours += h;
    const name = (s.client && s.client.clientName) || s.clientName || 'Unknown';
    byClient.set(name, (byClient.get(name) || 0) + h);
  }
  const breakdown = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="schedule-week-header">
      <div className="schedule-week-header__total">
        WEEK TOTAL · {formatHours(totalHours)} hrs · {shifts.length} shifts
      </div>
      <div className="schedule-week-header__breakdown">
        {breakdown.map(([name, h]) => (
          <div key={name} className="schedule-week-header__row">
            <span>{name}</span>
            <span>{formatHours(h)} hrs</span>
          </div>
        ))}
      </div>
    </div>
  );
}
