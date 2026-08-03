import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LeadRemindersModal from './LeadRemindersModal';

// Event name other parts of the app dispatch to open the reminders briefing
// on demand (e.g. the dashboard notification click).
export const OPEN_LEAD_REMINDERS_EVENT = 'leads:open-reminders';

export function openLeadReminders() {
    window.dispatchEvent(new CustomEvent(OPEN_LEAD_REMINDERS_EVENT));
}

/**
 * App-wide gate that shows the lead follow-up reminders popup once per calendar
 * day on whatever authenticated page the user lands on. Mounted in Layout so it
 * is not tied to the Leads page. Also opens on demand when any part of the app
 * dispatches the OPEN_LEAD_REMINDERS_EVENT (e.g. a dashboard notification).
 *
 * "Open lead" navigates to /leads?lead=<id>, where LeadsPage picks up the param
 * and opens that lead's detail (with full undo wiring on that page).
 */
export default function LeadRemindersGate() {
    const { isOffice, hasPermission } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    // Leads are office-only (admin/user); the /leads/* API is requireRole('admin','user').
    // pca users would 403, so never trigger the popup for them.
    const canSeeLeads = isOffice && hasPermission && hasPermission('leads');

    useEffect(() => {
        if (!canSeeLeads) return;
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
        if (localStorage.getItem('leadRemindersShown') === today) return;
        setOpen(true);
        localStorage.setItem('leadRemindersShown', today);
    }, [canSeeLeads]);

    useEffect(() => {
        if (!canSeeLeads) return;
        const handler = () => setOpen(true);
        window.addEventListener(OPEN_LEAD_REMINDERS_EVENT, handler);
        return () => window.removeEventListener(OPEN_LEAD_REMINDERS_EVENT, handler);
    }, [canSeeLeads]);

    if (!canSeeLeads) return null;

    return (
        <LeadRemindersModal
            open={open}
            onClose={() => setOpen(false)}
            onOpenLead={(id) => {
                setOpen(false);
                navigate(`/leads?lead=${id}`);
            }}
        />
    );
}
