import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from '../components/common/Icons';
import { useAuth } from '../hooks/useAuth';
import { getHostInfo } from '../api';
import LandingPage from './LandingPage';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hostChecking, setHostChecking] = useState(true);
    const [hostType, setHostType] = useState('agency'); // 'platform' | 'agency' | 'landing'
    const [agencyName, setAgencyName] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const notice = sessionStorage.getItem('login_notice');
        if (notice) {
            sessionStorage.removeItem('login_notice');
            setError(notice);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        getHostInfo()
            .then((info) => {
                if (cancelled) return;
                setHostType(info.type);
                if (info.type === 'agency' && info.agency) {
                    setAgencyName(info.agency.name);
                }
            })
            .catch(() => {
                // Fetch failure (network error, etc.) falls back to the
                // agency-style login form so the page still renders something
                // usable rather than getting stuck or blank.
                if (cancelled) return;
                setHostType('agency');
            })
            .finally(() => { if (!cancelled) setHostChecking(false); });
        return () => { cancelled = true; };
    }, []);

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

    if (!hostChecking && hostType === 'landing') {
        return <LandingPage />;
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-card__header">
                    <div className="login-card__logo">{Icons.shieldCheck}</div>
                    <h1 className="login-card__title">PCAlink</h1>
                    <p className="login-card__subtitle">
                        {hostType === 'platform' ? 'Platform Console' : (agencyName || 'Service Delivery Platform')}
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="login-card__form">
                    {error && (
                        <div className="login-error">
                            {Icons.alertCircle}
                            <span>{error}</span>
                        </div>
                    )}
                    <div className="form-group">
                        <label htmlFor="login-email">Email</label>
                        <input id="login-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="Enter your email" autoFocus required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="login-password">Password</label>
                        <input id="login-password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Enter your password" required />
                    </div>
                    <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                    {hostType !== 'platform' && (
                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                            <a href="/forgot-password" className="login-forgot-link" onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}>
                                Forgot your password?
                            </a>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
