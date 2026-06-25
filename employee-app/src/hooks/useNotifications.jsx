import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CERT_TYPES } from '../utils/certTypes';
import { api } from '../api';

const Ctx = createContext(null);

function statusOfCert(cert) {
  if (!cert) return 'missing';
  if (cert.expirationDate) {
    const exp = new Date(cert.expirationDate).getTime();
    const now = Date.now();
    if (exp < now) return 'expired';
    if (exp <= now + 30 * 86400000) return 'expiring';
    return 'approved';
  }
  if (cert.status === 'active' || cert.status === 'approved') return 'approved';
  return 'pending';
}

function derive(certsArray, tasksArray, unread) {
  const certsByType = new Map();
  for (const t of CERT_TYPES) certsByType.set(t, null);
  const others = [];
  if (Array.isArray(certsArray)) {
    for (const c of certsArray) {
      if (c.status === 'expired_replaced') continue;
      if (certsByType.has(c.certType)) {
        const cur = certsByType.get(c.certType);
        if (!cur || new Date(c.updatedAt || 0) > new Date(cur.updatedAt || 0)) {
          certsByType.set(c.certType, c);
        }
      } else {
        others.push(c);
      }
    }
  }
  if (others.length) certsByType.set('Other', { certType: 'Other', others });

  let approved = 0, pending = 0, actionNeeded = 0, expiringSoon = 0, overdue = 0;
  for (const t of CERT_TYPES) {
    const cert = certsByType.get(t);
    const s = statusOfCert(cert && cert.others ? null : cert);
    if (s === 'approved') approved++;
    else if (s === 'pending') pending++;
    else { actionNeeded++; if (s === 'expiring') expiringSoon++; if (s === 'missing' || s === 'expired') overdue++; }
  }
  const tasksOpen = Array.isArray(tasksArray) ? tasksArray.filter(t => !t.completedAt).length : 0;

  let complianceState;
  if (overdue > 0) complianceState = 'overdue';
  else if (expiringSoon > 0 || tasksOpen > 0) complianceState = 'attention';
  else complianceState = 'compliant';

  return {
    certs: certsArray,
    certsByType,
    certsApproved: approved,
    certsPending: pending,
    certsActionNeeded: actionNeeded,
    certsTotal: 8,
    tasksOpen,
    unreadMessages: typeof unread === 'number' ? unread : 0,
    complianceState,
  };
}

export function NotificationsProvider({ children }) {
  const [certs, setCerts] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [unread, setUnread] = useState(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [c, t, u] = await Promise.allSettled([
        api.getCertifications(),
        api.getTasks(),
        api.getMessageUnreadCount(),
      ]);
      if (c.status === 'fulfilled') setCerts(c.value.certifications || c.value || []);
      if (t.status === 'fulfilled') setTasks(t.value || []);
      if (u.status === 'fulfilled') setUnread(typeof u.value === 'number' ? u.value : (u.value && u.value.count) || 0);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let id;
    function tick() {
      if (document.visibilityState === 'visible') refresh();
    }
    id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const value = { ...derive(certs, tasks, (unread && unread.count) ?? unread), refresh, loading };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return v;
}
