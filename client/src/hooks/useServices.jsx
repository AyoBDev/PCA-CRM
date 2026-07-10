import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import { SERVICE_CODE_NAMES, AUTH_COLORS, getAuthSortKey } from '../utils/constants';
import { SERVICE_CODE_OPTIONS } from '../utils/serviceCodes';
import { SERVICE_CODE_ACCOUNT_MAP } from '../utils/accountMapping';

const ServicesContext = createContext(null);

export function ServicesProvider({ children }) {
  const [services, setServices] = useState([]);

  const refetch = useCallback(async () => {
    try { setServices(await api.getServices()); } catch { /* fall back to constants */ }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const byCode = {};
  for (const s of services) byCode[s.code] = s;

  const serviceMeta = useCallback((code) => {
    const db = byCode[code] || {};
    return {
      category: db.category || '',
      name: db.name || SERVICE_CODE_NAMES[code] || code,
      label: db.label || (SERVICE_CODE_OPTIONS.flatMap(g => g.codes).find(c => c.value === code)?.label) || code,
      accountNumber: db.accountNumber || SERVICE_CODE_ACCOUNT_MAP[code] || '',
      color: db.color || AUTH_COLORS[code]?.accent || '#64748b',
      timesheetSection: db.timesheetSection || '',
      sortOrder: (db.sortOrder != null ? db.sortOrder : undefined),
    };
  }, [services]);

  const serviceName = useCallback((code) => serviceMeta(code).name, [serviceMeta]);
  const serviceColor = useCallback((code) => serviceMeta(code).color, [serviceMeta]);
  const accountForCode = useCallback((code) => serviceMeta(code).accountNumber, [serviceMeta]);
  const sortKey = useCallback((code, name) => {
    const meta = serviceMeta(code);
    return meta.sortOrder != null ? meta.sortOrder : getAuthSortKey(code, name);
  }, [serviceMeta]);

  const serviceOptions = useCallback(() => {
    if (!services.length) return SERVICE_CODE_OPTIONS;
    // group DB services by category, preserving constant grouping when possible
    const groups = {};
    for (const s of services) {
      const g = s.category || 'Other';
      (groups[g] = groups[g] || []).push({ value: s.code, label: s.label || s.code, sortOrder: s.sortOrder });
    }
    // within each group, admin-controlled sortOrder governs dropdown order (ascending),
    // tiebreak by code for stable ordering when sortOrder is equal/absent
    for (const codes of Object.values(groups)) {
      codes.sort((a, b) => {
        const ao = a.sortOrder != null ? a.sortOrder : 50;
        const bo = b.sortOrder != null ? b.sortOrder : 50;
        if (ao !== bo) return ao - bo;
        return a.value.localeCompare(b.value);
      });
    }
    return Object.entries(groups).map(([group, codes]) => ({
      group,
      codes: codes.map(({ value, label }) => ({ value, label })),
    }));
  }, [services]);

  const value = { services, refetch, serviceMeta, serviceOptions, serviceName, serviceColor, accountForCode, sortKey };
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used within ServicesProvider');
  return ctx;
}
