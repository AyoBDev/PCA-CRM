import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const STATUS_COPY = {
  pending_review: {
    title: 'Onboarding submitted',
    body: "Your account is pending review. We'll email you when it's activated.",
  },
  changes_requested: {
    title: 'Changes requested',
    body: 'Your admin asked for changes. Open the link in your email to fix the flagged items and resubmit.',
  },
  inactive: {
    title: 'Account inactive',
    body: 'Your account is inactive. Please contact your administrator.',
  },
};

const DEFAULT_COPY = {
  title: 'Complete your setup',
  body: 'Please finish onboarding using the link in your email.',
};

export default function OnboardingStatusPage() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.onboardingStatus === 'active') return <Navigate to="/" replace />;

  const copy = STATUS_COPY[user.onboardingStatus] || DEFAULT_COPY;

  return (
    <div className="loading-screen onboarding-status-screen">
      <div className="card onboarding-status-screen__card">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </div>
    </div>
  );
}
