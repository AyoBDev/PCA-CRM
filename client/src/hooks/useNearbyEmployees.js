import { useState, useEffect } from 'react';
import * as api from '../api';

/**
 * Ranked employees for a prospective shift, for the shift-creation picker.
 *
 * Only fetches once the shift is specific enough to determine availability —
 * client, date, and BOTH times. Until then it reports `ranked: null` and the
 * caller shows its plain unranked list, so the UI never implies it has checked
 * availability when it has not yet been told when the shift is.
 *
 * Degrades silently: a failed request, a missing geocoding token, or
 * un-geocoded addresses all leave `ranked` null rather than surfacing an error.
 * Shift creation is the most-used screen in the app and must not break because
 * a lookup is unavailable.
 */
export function useNearbyEmployees({ clientId, serviceCode, date, startTime, endTime }) {
    const [ranked, setRanked] = useState(null);
    const [loading, setLoading] = useState(false);

    const complete = !!(clientId && date && startTime && endTime);

    useEffect(() => {
        if (!complete) {
            setRanked(null);
            return;
        }

        let cancelled = false;
        setLoading(true);

        // Debounced: the time fields change on every keystroke, and each change
        // alters who is available.
        const timer = setTimeout(async () => {
            try {
                const result = await api.getNearbyEmployees({ clientId, serviceCode, date, startTime, endTime });
                if (cancelled) return;
                setRanked(result?.status === 'ok' ? result : null);
            } catch {
                if (!cancelled) setRanked(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 350);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [complete, clientId, serviceCode, date, startTime, endTime]);

    return { ranked, loading };
}

/** Human-readable label for a ranking conflict. */
export const CONFLICT_LABELS = {
    already_scheduled: 'Already scheduled',
    time_off: 'Time off',
    compliance_expired: 'Compliance expired',
    blackout_date: 'Unavailable this day',
};

export function conflictLabel(conflicts = []) {
    return conflicts.map(c => CONFLICT_LABELS[c] || c).join(' · ');
}
