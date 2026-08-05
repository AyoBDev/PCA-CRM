import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LeadRemindersModal from './LeadRemindersModal';
import OnboardingReviewModal from '../employees/OnboardingReviewModal';

// Event name other parts of the app dispatch to open the reminders briefing
// on demand (e.g. the dashboard notification click).
export const OPEN_LEAD_REMINDERS_EVENT = 'leads:open-reminders';

// localStorage keys: the daily "already shown today" stamp and the snooze deadline.
const SHOWN_KEY = 'leadRemindersShown';
const SNOOZE_KEY = 'leadRemindersSnoozedUntil';
const SNOOZE_MS = 30 * 60 * 1000; // 30 minutes

export function openLeadReminders() {
    window.dispatchEvent(new CustomEvent(OPEN_LEAD_REMINDERS_EVENT));
}

// Snooze deadline as a ms timestamp, or 0 if not snoozed / already elapsed.
function snoozedUntil() {
    const raw = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return raw > Date.now() ? raw : 0;
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
    const [reviewEmployeeId, setReviewEmployeeId] = useState(null); // onboarding review modal
    const removeReviewRef = useRef(null); // drops the resolved employee from the popup list

    // Leads are office-only (admin/user); the /leads/* API is requireRole('admin','user').
    // pca users would 403, so never trigger the popup for them.
    const canSeeLeads = isOffice && hasPermission && hasPermission('leads');

    // Show once per calendar day on landing — unless the user has snoozed, in
    // which case the snooze timer (below) is what re-opens it.
    useEffect(() => {
        if (!canSeeLeads) return;
        if (snoozedUntil()) return;
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
        if (localStorage.getItem(SHOWN_KEY) === today) return;
        setOpen(true);
        localStorage.setItem(SHOWN_KEY, today);
    }, [canSeeLeads]);

    // On-demand open (e.g. dashboard notification click) — always honored,
    // even mid-snooze, since it's an explicit user action.
    useEffect(() => {
        if (!canSeeLeads) return;
        const handler = () => setOpen(true);
        window.addEventListener(OPEN_LEAD_REMINDERS_EVENT, handler);
        return () => window.removeEventListener(OPEN_LEAD_REMINDERS_EVENT, handler);
    }, [canSeeLeads]);

    // Auto re-pop when a snooze elapses while the app stays open. Re-arms itself
    // each time `open` changes (a fresh snooze on close schedules the next pop).
    useEffect(() => {
        if (!canSeeLeads || open) return;
        const until = snoozedUntil();
        if (!until) return;
        const id = setTimeout(() => setOpen(true), until - Date.now());
        return () => clearTimeout(id);
    }, [canSeeLeads, open]);

    const handleSnooze = () => {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
        setOpen(false);
    };

    if (!canSeeLeads) return null;

    return (
        <>
            <LeadRemindersModal
                open={open}
                onClose={() => setOpen(false)}
                onSnooze={handleSnooze}
                onOpenLead={(id) => {
                    setOpen(false);
                    navigate(`/leads?lead=${id}`);
                }}
                onOpenEmployeeReview={(id, remove) => {
                    // Open the review modal over the popup; keep the popup mounted so
                    // resolving one review just drops that row from the remaining list.
                    removeReviewRef.current = remove;
                    setReviewEmployeeId(id);
                }}
            />
            {reviewEmployeeId != null && (
                <OnboardingReviewModal
                    employeeId={reviewEmployeeId}
                    onClose={() => setReviewEmployeeId(null)}
                    onResolved={() => {
                        // Accepted/rejected/change-requested → remove from the popup list.
                        removeReviewRef.current?.();
                        setReviewEmployeeId(null);
                    }}
                />
            )}
        </>
    );
}
