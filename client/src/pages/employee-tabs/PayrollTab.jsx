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

    if (loading) return <div className="activity-drawer__loading">Loading...</div>;

    if (!profile && !editing) {
        return (
            <div className="empty-state">
                <div className="empty-state__icon">{Icons.dollarSign}</div>
                <div className="empty-state__title">No payroll profile</div>
                <div className="empty-state__desc">Set up payroll details for this employee.</div>
                <button className="btn btn--primary" onClick={() => { setEditing(true); setForm({ hourlyRate: 0, classification: 'W2', ssn: '', ein: '', accountNumber: '', garnishmentActive: false, childSupportActive: false, childSupportAmount: 0, overpaymentBalance: 0 }); }}>
                    {Icons.plus} Create Profile
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Payroll Profile</h3>
                {!editing && (
                    <button className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>
                        {Icons.edit} Edit
                    </button>
                )}
            </div>

            <div className="form-grid-2">
                <div className="form-group">
                    <label>Hourly Rate ($)</label>
                    <input type="number" step="0.01" value={form.hourlyRate || ''} onChange={e => handleChange('hourlyRate', e.target.value)} disabled={!editing} />
                </div>
                <div className="form-group">
                    <label>Classification</label>
                    <select value={form.classification || 'W2'} onChange={e => handleChange('classification', e.target.value)} disabled={!editing}>
                        <option value="W2">W2</option>
                        <option value="1099">1099</option>
                    </select>
                </div>
            </div>

            <div className="form-grid-2">
                <div className="form-group">
                    <label>SSN</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="text" value={editing ? form.ssn : (revealedFields.ssn || profile?.ssn || '')} onChange={e => handleChange('ssn', e.target.value)} disabled={!editing} />
                        {!editing && <button className="btn btn--ghost btn--xs" onClick={() => handleReveal('ssn')}>{Icons.eye}</button>}
                    </div>
                </div>
                <div className="form-group">
                    <label>EIN</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="text" value={editing ? form.ein : (revealedFields.ein || profile?.ein || '')} onChange={e => handleChange('ein', e.target.value)} disabled={!editing} />
                        {!editing && <button className="btn btn--ghost btn--xs" onClick={() => handleReveal('ein')}>{Icons.eye}</button>}
                    </div>
                </div>
            </div>

            <div className="form-group">
                <label>Account Number</label>
                <input type="text" value={form.accountNumber || ''} onChange={e => handleChange('accountNumber', e.target.value)} disabled={!editing} />
            </div>

            <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>Deductions</h4>
            <div className="form-grid-2">
                <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={form.garnishmentActive || false} onChange={e => handleChange('garnishmentActive', e.target.checked)} disabled={!editing} />
                        Garnishment (18%)
                    </label>
                </div>
                <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={form.childSupportActive || false} onChange={e => handleChange('childSupportActive', e.target.checked)} disabled={!editing} />
                        Child Support
                    </label>
                    {form.childSupportActive && (
                        <input type="number" step="0.01" placeholder="Amount per period" value={form.childSupportAmount || ''} onChange={e => handleChange('childSupportAmount', e.target.value)} disabled={!editing} style={{ marginTop: 4 }} />
                    )}
                </div>
            </div>

            <div className="form-group">
                <label>Overpayment Balance ($)</label>
                <input type="number" step="0.01" value={form.overpaymentBalance || ''} onChange={e => handleChange('overpaymentBalance', e.target.value)} disabled={!editing} />
            </div>

            {editing && (
                <div className="form-actions">
                    <button className="btn btn--outline" onClick={() => { setEditing(false); setForm(profile || {}); }}>Cancel</button>
                    <button className="btn btn--primary" onClick={handleSave}>Save</button>
                </div>
            )}
        </div>
    );
}
