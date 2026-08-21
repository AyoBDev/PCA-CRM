function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

export function progressForCert({ status, days, renewalYears, hasFile }) {
    if (status === 'expired') return { pct: 0, variant: 'expired' };
    if (days == null) {
        if (hasFile) return { pct: 100, variant: 'complete' };
        return { pct: 15, variant: 'notset' };
    }
    const windowDays = renewalYears ? renewalYears * 365 : Math.max(days, 1);
    const pct = clamp(Math.round((days / windowDays) * 100), 0, 100);
    return { pct, variant: status === 'critical' ? 'expiring' : 'active' };
}
