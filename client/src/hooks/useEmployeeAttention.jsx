import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import { useAuth } from './useAuth';

const Ctx = createContext(null);

const ZERO_COUNTS = { certsPendingReview: 0, timeOffPending: 0, availabilityPending: 0, profileChangesUnseen: 0 };

export function EmployeeAttentionProvider({ children }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState(ZERO_COUNTS);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await api.getEmployeeAttention();
      setCounts(data?.counts || ZERO_COUNTS);
      setRecentEvents(Array.isArray(data?.recentEvents) ? data.recentEvents : []);
    } catch (_) {
      setCounts(ZERO_COUNTS);
      setRecentEvents([]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const markSeen = useCallback(async (keys) => {
    try { await api.markAttentionSeen(keys); } catch (_) { /* silent; will retry */ }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    const isStaffUser = user && (user.role === 'admin' || user.role === 'user');
    if (isStaffUser) refresh();
  }, [refresh, user]);

  useEffect(() => {
    const isStaffUser = user && (user.role === 'admin' || user.role === 'user');
    if (!isStaffUser) return;

    function tick() { if (document.visibilityState === 'visible') refresh(); }
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh, user]);

  const totalCount =
    (counts.certsPendingReview || 0) +
    (counts.timeOffPending || 0) +
    (counts.availabilityPending || 0) +
    (counts.profileChangesUnseen || 0);

  const value = { counts, totalCount, recentEvents, markSeen, refresh, loading };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEmployeeAttention() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEmployeeAttention must be used inside <EmployeeAttentionProvider>');
  return v;
}
