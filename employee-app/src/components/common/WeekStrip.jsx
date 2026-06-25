import { useNavigate } from 'react-router-dom';
import { hoursBetween } from '../../utils/hoursBetween';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function addDays(yyyymmdd, n) {
  const d = new Date(yyyymmdd + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayLocalISO() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function WeekStrip({ weekStart, shifts = [] }) {
  const navigate = useNavigate();
  const today = todayLocalISO();
  const byDay = new Map();
  for (const s of shifts) {
    const d = (s.shiftDate || '').slice(0, 10);
    const cur = byDay.get(d) || 0;
    byDay.set(d, cur + hoursBetween(s.startTime, s.endTime));
  }
  return (
    <div className="week-strip" role="row">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const hours = byDay.get(date) || 0;
        const isToday = date === today;
        const isActive = hours > 0;
        const cls = `week-strip__day ${isToday ? 'week-strip__day--today' : ''} ${isActive ? 'week-strip__day--active' : ''}`.trim();
        return (
          <button key={date} type="button" className={cls} onClick={() => navigate(`/schedule?date=${date}`)}>
            <span className="week-strip__label">{DAYS[i]}</span>
            <span className="week-strip__date">{date.slice(8, 10).replace(/^0/, '')}</span>
            {isActive && <span className="week-strip__hours">{Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}h`}</span>}
          </button>
        );
      })}
    </div>
  );
}
