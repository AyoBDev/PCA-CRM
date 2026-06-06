import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import Icons from '../../components/common/Icons';
import { useToast } from '../../hooks/useToast';

export default function PayrollTab({ employeeId }) {
    const { showToast } = useToast();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [revealedFields, setRevealedFields] = useState({});

    const fetchProfile = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getPayrollProfile(employeeId);
            setProfile(data);
            if (data) setForm(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [employeeId]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const handleSave = async () => {
        try {
            const payload = { ...form };
            if (payload.ssn && payload.ssn.includes('*')) delete payload.ssn;
            if (payload.ein && payload.ein.includes('*')) delete payload.ein;
            delete payload.id;
            delete payload.employeeId;
            delete payload.createdAt;
            delete payload.updatedAt;
            const updated = await api.upsertPayrollProfile(employeeId, payload);
            setProfile(updated);
            setForm(updated);
            setEditing(false);
            showToast('Payroll profile saved', 'success');
        } catch (err) {
            showToast('Failed to save', 'error');
        }
    };

    const handleReveal = async (field) => {
        try {
            const { value } = await api.revealPayrollField(employeeId, field);
            setRevealedFields(prev => ({ ...prev, [field]: value }));
        } catch (err) {
            showToast('Failed to reveal', 'error');
        }
    };

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    if (loading) return <div className="cp-tab-panel"><p style={{ color: 'hsl(var(--muted-foreground))' }}>Loading...</p></div>;

    if (!profile && !editing) {
        return (
            <div className="cp-tab-panel">
                <div className="cp-card cp-card--elevated" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ color: 'hsl(var(--muted-foreground))', marginBottom: 12 }}>{Icons.dollarSign}</div>
                    <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>No payroll profile</h3>
                    <p style={{ margin: '0 0 20px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>Set up payroll details for this employee.</p>
                    <button className="btn btn--primary" onClick={() => { setEditing(true); setForm({ hourlyRate: 0, classification: 'W2', ssn: '', ein: '', accountNumber: '', garnishmentActive: false, childSupportActive: false, childSupportAmount: 0, overpaymentBalance: 0 }); }}>
                        {Icons.plus} Create Profile
                    </button>
                </div>
            </div>
        );
    }

    if (!editing) {
        return (
            <div className="cp-tab-panel">
                <div className="cp-summary-grid">
                    <div className="cp-card cp-card--elevated">
                        <div className="cp-card__header">
                            <h3 className="cp-card__title">
                                <span className="cp-card__dot cp-card__dot--green" />
                                Compensation
                            </h3>
                            <button className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>
                                {Icons.edit} Edit
                            </button>
                        </div>
                        <div className="cp-card__body">
                            <div className="cp-info-list">
                                <div className="cp-info-row">
                                    <span className="cp-info-row__label">Hourly Rate</span>
                                    <span className="cp-info-row__value" style={{ fontWeight: 600 }}>${Number(profile.hourlyRate).toFixed(2)}</span>
                                </div>
                                <div className="cp-info-row">
                                    <span className="cp-info-row__label">Classification</span>
                                    <span className="cp-info-row__value">{profile.classification}</span>
                                </div>
                                <div className="cp-info-row">
                                    <span className="cp-info-row__label">Account Number</span>
                                    <span className="cp-info-row__value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{profile.accountNumber || '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="cp-card cp-card--elevated">
                        <div className="cp-card__header">
                            <h3 className="cp-card__title">
                                <span className="cp-card__dot cp-card__dot--blue" />
                                Tax Identifiers
                            </h3>
                        </div>
                        <div className="cp-card__body">
                            <div className="cp-info-list">
                                <div className="cp-info-row">
                                    <span className="cp-info-row__label">SSN</span>
                                    <span className="cp-info-row__value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{revealedFields.ssn || profile.ssn || '—'}</span>
                                        {profile.ssn && <button className="btn btn--ghost btn--xs" onClick={() => handleReveal('ssn')}>{Icons.eye}</button>}
                                    </span>
                                </div>
                                <div className="cp-info-row">
                                    <span className="cp-info-row__label">EIN</span>
                                    <span className="cp-info-row__value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{revealedFields.ein || profile.ein || '—'}</span>
                                        {profile.ein && <button className="btn btn--ghost btn--xs" onClick={() => handleReveal('ein')}>{Icons.eye}</button>}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="cp-card cp-card--elevated" style={{ marginTop: 12 }}>
                    <div className="cp-card__header">
                        <h3 className="cp-card__title">
                            <span className="cp-card__dot cp-card__dot--amber" />
                            Deductions
                        </h3>
                    </div>
                    <div className="cp-card__body">
                        <div className="cp-info-list">
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Garnishment (18%)</span>
                                <span className="cp-info-row__value">{profile.garnishmentActive ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Child Support</span>
                                <span className="cp-info-row__value">{profile.childSupportActive ? `Active — $${Number(profile.childSupportAmount).toFixed(2)}/period` : 'Inactive'}</span>
                            </div>
                            <div className="cp-info-row">
                                <span className="cp-info-row__label">Overpayment Balance</span>
                                <span className="cp-info-row__value" style={{ fontWeight: Number(profile.overpaymentBalance) > 0 ? 600 : 400, color: Number(profile.overpaymentBalance) > 0 ? 'hsl(var(--destructive))' : undefined }}>
                                    ${Number(profile.overpaymentBalance).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        <span className="cp-card__dot cp-card__dot--green" />
                        {profile ? 'Edit Payroll Profile' : 'Create Payroll Profile'}
                    </h3>
                </div>
                <div className="cp-card__body">
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>Hourly Rate ($)</label>
                            <input type="number" step="0.01" value={form.hourlyRate || ''} onChange={e => handleChange('hourlyRate', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Classification</label>
                            <select value={form.classification || 'W2'} onChange={e => handleChange('classification', e.target.value)}>
                                <option value="W2">W2</option>
                                <option value="1099">1099</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>SSN</label>
                            <input type="text" value={form.ssn || ''} onChange={e => handleChange('ssn', e.target.value)} placeholder="123-45-6789" />
                        </div>
                        <div className="form-group">
                            <label>EIN</label>
                            <input type="text" value={form.ein || ''} onChange={e => handleChange('ein', e.target.value)} placeholder="12-3456789" />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Account Number</label>
                        <input type="text" value={form.accountNumber || ''} onChange={e => handleChange('accountNumber', e.target.value)} />
                    </div>

                    <div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: 16, paddingTop: 16 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'hsl(var(--foreground))' }}>Deductions</h4>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={form.garnishmentActive || false} onChange={e => handleChange('garnishmentActive', e.target.checked)} />
                                    Garnishment (18%)
                                </label>
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={form.childSupportActive || false} onChange={e => handleChange('childSupportActive', e.target.checked)} />
                                    Child Support
                                </label>
                                {form.childSupportActive && (
                                    <input type="number" step="0.01" placeholder="Amount per period" value={form.childSupportAmount || ''} onChange={e => handleChange('childSupportAmount', e.target.value)} style={{ marginTop: 4 }} />
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Overpayment Balance ($)</label>
                            <input type="number" step="0.01" value={form.overpaymentBalance || ''} onChange={e => handleChange('overpaymentBalance', e.target.value)} />
                        </div>
                    </div>

                    <div className="form-actions" style={{ marginTop: 16 }}>
                        <button className="btn btn--outline" onClick={() => { setEditing(false); setForm(profile || {}); }}>Cancel</button>
                        <button className="btn btn--primary" onClick={handleSave}>Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
