import { useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import { useEmployeeAttention } from '../hooks/useEmployeeAttention';

function labelFor(event) {
    const who = event.employeeName || 'Employee';
    switch (event.type) {
        case 'cert-pending': return `New cert from ${who}: ${event.subject}`;
        case 'time-off-pending': return `Time-off request from ${who}`;
        case 'availability-pending': return `Schedule change request from ${who}`;
        case 'profile-change': return `${who} updated their profile`;
        default: return `Update from ${who}`;
    }
}

export default function AttentionToastWatcher() {
    const { recentEvents, markSeen } = useEmployeeAttention();
    const { showToast } = useToast();
    const seen = useRef(new Set());

    useEffect(() => {
        if (!Array.isArray(recentEvents) || recentEvents.length === 0) return;
        const fresh = recentEvents.filter(e => !seen.current.has(e.eventKey));
        if (fresh.length === 0) return;
        for (const e of fresh) {
            seen.current.add(e.eventKey);
            showToast(labelFor(e), 'info');
        }
        markSeen(fresh.map(e => e.eventKey));
    }, [recentEvents, showToast, markSeen]);

    return null;
}
