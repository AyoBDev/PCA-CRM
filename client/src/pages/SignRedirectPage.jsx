import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api';
import Icons from '../components/common/Icons';

export default function SignRedirectPage() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getSigningForm(token)
            .then((data) => {
                if (data.redirect) {
                    navigate(`/pca-form/${data.redirect}`, { replace: true });
                } else {
                    setError('Unable to resolve this link. Please contact your administrator for a permanent link.');
                }
            })
            .catch((err) => setError(err.message));
    }, [token, navigate]);

    if (error) return (
        <div className="signing-page">
            <div className="signing-card signing-card--error">
                <div className="signing-card__icon" style={{ color: 'hsl(0 84% 60%)' }}>{Icons.alertCircle}</div>
                <h2>{error}</h2>
                <p>This signing link is no longer supported. Please contact your administrator for your permanent link.</p>
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'hsl(var(--muted-foreground))' }}>
            Redirecting…
        </div>
    );
}
