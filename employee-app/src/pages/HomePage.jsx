import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../api';
import ComplianceBanner from '../components/common/ComplianceBanner';
import NextShiftCard from '../components/common/NextShiftCard';
import WeekStrip from '../components/common/WeekStrip';
import SummaryChip from '../components/common/SummaryChip';
import ActivityFeed from '../components/common/ActivityFeed';

function thisSundayISO() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function HomePage() {
  const { user } = useAuth();
  const { complianceState, certsActionNeeded, tasksOpen, unreadMessages } = useNotifications();
  const [nextShift, setNextShift] = useState(null);
  const [weekShifts, setWeekShifts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const sunday = thisSundayISO();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.getNextShift(),
      api.getWeekSchedule(sunday),
      api.getActivity(),
    ]).then(([ns, ws, act]) => {
      if (cancelled) return;
      if (ns.status === 'fulfilled') setNextShift(ns.value);
      if (ws.status === 'fulfilled') setWeekShifts(ws.value.shifts || ws.value || []);
      if (act.status === 'fulfilled') setActivity(Array.isArray(act.value) ? act.value : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sunday]);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const totalHours = weekShifts.reduce((sum, s) => {
    const [sh, sm] = (s.startTime || '0:0').split(':').map(Number);
    const [eh, em] = (s.endTime || '0:0').split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return sum + mins / 60;
  }, 0);

  const certVariant = complianceState === 'compliant' ? 'success' : complianceState === 'attention' ? 'warning' : 'danger';
  const certLabel = complianceState === 'compliant' ? 'Certs ✓' : `${certsActionNeeded} cert${certsActionNeeded === 1 ? '' : 's'} need attention`;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hi, {firstName}</h1>
      </div>

      <ComplianceBanner />

      {loading ? <div className="skeleton skeleton--card" /> : <NextShiftCard shift={nextShift} />}

      {loading ? <div className="skeleton skeleton--card" style={{ height: 60 }} /> : <WeekStrip weekStart={sunday} shifts={weekShifts} />}

      <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: '4px 0 16px' }}>
        Week total: {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} hrs · {weekShifts.length} shift{weekShifts.length === 1 ? '' : 's'}
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <SummaryChip label="shifts this week" value={weekShifts.length} />
        <SummaryChip label="hrs scheduled" value={totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} />
        <SummaryChip label={certLabel} value="" href="/account/certs" variant={certVariant} />
        <SummaryChip label="messages" value={unreadMessages || 0} href="/messages" variant={unreadMessages > 0 ? 'warning' : 'neutral'} />
      </div>

      <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Recent Activity</h2>
      <ActivityFeed items={activity} limit={5} />
    </div>
  );
}
