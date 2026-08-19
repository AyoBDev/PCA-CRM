import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

const STATUS_COPY = {
  pending_review: {
    title: 'Onboarding submitted',
    body: "Your account is pending review. We'll email you when it's activated.",
  },
  changes_requested: {
    title: 'Changes requested',
    body: 'Your admin has asked for a few corrections. Continue below to fix the flagged items and resubmit — no email link needed.',
  },
  inactive: {
    title: 'Account inactive',
    body: 'Your account is inactive. Please contact your administrator.',
  },
};

const DEFAULT_COPY = {
  title: 'Complete your setup',
  body: 'Continue below to finish your onboarding.',
};

// Statuses where the employee can (and should) re-enter the onboarding wizard in-app.
const RESUMABLE = ['changes_requested', 'onboarding_in_progress', 'invitation_pending'];

export default function OnboardingStatusPage() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [link, setLink] = useState(null);
  const [linkError, setLinkError] = useState(false);

  // Poll the employee's current status on mount so that once an admin approves
  // them (status → active), the gated employee picks it up without re-logging in
  // — the page's own active→/ guard below then lets them through.
  useEffect(() => { if (refreshMe) refreshMe(); }, [refreshMe]);

  // For resumable statuses, fetch this employee's own onboarding token so we can
  // send them straight into the wizard in-app (the second entry point, no email link).
  const status = user?.onboardingStatus;
  useEffect(() => {
    let alive = true;
    if (status && RESUMABLE.includes(status)) {
      api.getMyOnboardingLink()
        .then((d) => { if (alive) setLink(d && d.token ? d.token : null); })
        .catch(() => { if (alive) setLinkError(true); });
    }
    return () => { alive = false; };
  }, [status]);

  if (!user) return <Navigate to="/login" replace />;
  if (status === 'active') return <Navigate to="/" replace />;

  const copy = STATUS_COPY[status] || DEFAULT_COPY;
  const canResume = status && RESUMABLE.includes(status);

  return (
    <div className="loading-screen onboarding-status-screen">
      <div className="card onboarding-status-screen__card">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {canResume && (
          link ? (
            <button className="btn btn--primary" onClick={() => navigate(`/onboard/${link}`)}>
              {status === 'changes_requested' ? 'Fix flagged items' : 'Continue onboarding'}
            </button>
          ) : linkError ? (
            <p className="onboarding-status-screen__hint">
              We couldn’t open your onboarding automatically. Please use the link in your email, or contact your administrator.
            </p>
          ) : (
            <p className="onboarding-status-screen__hint">Loading your onboarding…</p>
          )
        )}
      </div>
    </div>
  );
}
