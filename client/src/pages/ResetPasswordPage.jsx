import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 4) {
            setError('Password must be at least 4 characters');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.resetPasswordWithToken(token, password);
            setSuccess(true);
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div className="login-card__header">
                        <div className="login-card__logo">{Icons.shieldCheck}</div>
                        <h1 className="login-card__title">PCAlink</h1>
                    </div>
                    <div className="reset-success">
                        <div className="login-error" style={{ marginBottom: 16 }}>
                            {Icons.alertCircle}
                            <span>Invalid reset link. Please request a new one.</span>
                        </div>
                        <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => navigate('/forgot-password')}>
                            Request New Link
                        </button>
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
                    <p className="login-card__subtitle">Set New Password</p>
                </div>
                {success ? (
                    <div className="reset-success">
                        <div className="reset-success__icon">{Icons.checkCircle}</div>
                        <h3 style={{ margin: '12px 0 8px', fontSize: 16 }}>Password reset successful</h3>
                        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13, lineHeight: 1.5 }}>
                            Your password has been updated. You can now sign in with your new password.
                        </p>
                        <button className="btn btn--primary" style={{ width: '100%', marginTop: 20 }} onClick={() => navigate('/login')}>
                            Sign In
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="login-card__form">
                        {error && (
                            <div className="login-error">
                                {Icons.alertCircle}
                                <span>{error}</span>
                            </div>
                        )}
                        <div className="form-group">
                            <label>New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                    placeholder="Minimum 4 characters"
                                    required
                                    minLength={4}
                                    autoFocus
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                    style={{
                                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                        background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                                        color: 'hsl(var(--muted-foreground))',
                                    }}
                                >
                                    {showPassword ? Icons.eyeOff : Icons.eye}
                                </button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Confirm Password</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                                placeholder="Re-enter your password"
                                required
                                minLength={4}
                            />
                        </div>
                        <button type="submit" className="btn btn--primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
