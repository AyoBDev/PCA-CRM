import Icons from '../components/common/Icons';

// Contact email for the public landing page. Editable via the VITE_CONTACT_EMAIL
// build-time env var (set it in client/.env* or on the host); falls back to the
// default below when unset.
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'scriptayo@gmail.com';

// Minimal public landing page served on the apex domain in production (no
// agency, no platform host). No login form, no nav — just enough to say
// what the product is and how to get in touch. Agency and platform login
// live at LoginPage, reached from their own hosts.
export default function LandingPage() {
    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-card__header">
                    <div className="login-card__logo">{Icons.shieldCheck}</div>
                    <h1 className="login-card__title">CareOmni</h1>
                    <p className="login-card__subtitle">
                        Multi-agency PCA management — authorizations, timesheets, scheduling and payroll in one place.
                    </p>
                </div>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <a href={`mailto:${CONTACT_EMAIL}`} className="btn btn--primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                        {Icons.mail} Contact us
                    </a>
                </div>
            </div>
        </div>
    );
}
