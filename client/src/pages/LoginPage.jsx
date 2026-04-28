import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from '../components/common/Icons';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        setError('');
        try {
            const user = await login(email, password);
            navigate(user.role === 'admin' ? '/dashboard' : '/timesheets', { replace: true });
        } catch (err) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-card__header">
                    <div className="login-card__logo">{Icons.shieldCheck}</div>
                    <h1 className="login-card__title">PCAlink</h1>
                    <p className="login-card__subtitle">Service Delivery Platform</p>
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
