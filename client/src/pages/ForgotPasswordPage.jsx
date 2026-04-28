import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email) return;
        setLoading(true);
        setError('');
        try {
            await api.forgotPassword(email);
            setSent(true);
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.');
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
                    <p className="login-card__subtitle">Reset Your Password</p>
                </div>
                {sent ? (
                    <div className="reset-success">
                        <div className="reset-success__icon">{Icons.checkCircle}</div>
                        <h3 style={{ margin: '12px 0 8px', fontSize: 16 }}>Check your email</h3>
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13, lineHeight: 1.5 }}>
                            If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox and spam folder.
                        </p>
                        <button className="btn btn--primary" style={{ width: '100%', marginTop: 20 }} onClick={() => navigate('/login')}>
                            Back to Sign In
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="login-card__form">
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                            Enter your email address and we'll send you a link to reset your password.
                        </p>
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
                        <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                            <a href="/login" className="login-forgot-link" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>
                                Back to Sign In
                            </a>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
