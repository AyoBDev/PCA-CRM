import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from '../components/common/Icons';
import { useAuth } from '../hooks/useAuth';
import { getAgencyInfo } from '../api';

// Apex/platform domain heuristic: localhost, IPs, and bare two-label domains
// (e.g. "pcalink.com") are the apex; anything with an extra subdomain label
// (e.g. "acme.pcalink.com", "acme.localhost") is agency-scoped. This mirrors
// resolveAgency's server-side loopback/apex handling without needing a
// client-side BASE_DOMAIN env var.
function isApexHost(hostname) {
    if (!hostname) return true;
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    const labels = host.split('.');
    return labels.length <= 2;
}

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [agencyChecking, setAgencyChecking] = useState(true);
    const [agencyName, setAgencyName] = useState('');
    const [agencyNotFound, setAgencyNotFound] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const onApex = isApexHost(typeof window !== 'undefined' ? window.location.hostname : '');

    useEffect(() => {
        const notice = sessionStorage.getItem('login_notice');
        if (notice) {
            sessionStorage.removeItem('login_notice');
            setError(notice);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        getAgencyInfo()
            .then((info) => {
                if (cancelled) return;
                setAgencyName(info.name);
            })
            .catch((err) => {
                if (cancelled) return;
                if (err.status === 404 && !onApex) {
                    setAgencyNotFound(true);
                }
                // 404 on the apex domain is expected (no agency there) —
                // the platform login form renders in that case.
            })
            .finally(() => { if (!cancelled) setAgencyChecking(false); });
        return () => { cancelled = true; };
    }, [onApex]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        setError('');
        try {
            const user = await login(email, password);
            const dest = user.role === 'superadmin' ? '/platform' : user.role === 'admin' ? '/dashboard' : '/timesheets';
            navigate(dest, { replace: true });
        } catch (err) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!agencyChecking && agencyNotFound) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div className="login-card__header">
                        <div className="login-card__logo">{Icons.alertCircle}</div>
                        <h1 className="login-card__title">Agency Not Found</h1>
                    </div>
                    <div className="login-error">
                        {Icons.alertCircle}
                        <span>No agency exists at this address. Check the web address or contact support.</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-card__header">
                    <div className="login-card__logo">{Icons.shieldCheck}</div>
                    <h1 className="login-card__title">PCAlink</h1>
                    <p className="login-card__subtitle">{agencyName || 'Service Delivery Platform'}</p>
                </div>
                <form onSubmit={handleSubmit} className="login-card__form">
                    {error && (
                        <div className="login-error">
                            {Icons.alertCircle}
                            <span>{error}</span>
                        </div>
                    )}
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="Enter your email" autoFocus required />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Enter your password" required />
                    </div>
                    <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                        <a href="/forgot-password" className="login-forgot-link" onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}>
                            Forgot your password?
                        </a>
                    </div>
                </form>
            </div>
        </div>
    );
}
