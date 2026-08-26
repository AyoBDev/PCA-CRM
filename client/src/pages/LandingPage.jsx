import Icons from '../components/common/Icons';

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
                    <h1 className="login-card__title">PCAlink</h1>
                    <p className="login-card__subtitle">
                        Multi-agency PCA management — authorizations, timesheets, scheduling and payroll in one place.
                    </p>
                </div>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <a href="mailto:hello@pcalink.com" className="btn btn--primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
                        {Icons.mail} Contact us
                    </a>
                </div>
            </div>
        </div>
    );
}
