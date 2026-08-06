import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import DocumentsStep from '../components/onboarding/DocumentsStep';
import CertificationsStep from '../components/onboarding/CertificationsStep';
import PoliciesStep from '../components/onboarding/PoliciesStep';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requirements, setRequirements] = useState([]);

  const loadRequirements = useCallback(() => {
    return api.getRequirements()
      .then(res => setRequirements(res?.requirements || []))
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    api.getProfile().then(setProfile).finally(() => setLoading(false));
    loadRequirements();
  }, [loadRequirements]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { /* silent */ }
    setSaving(false);
  };

  const handleUpload = async (reqId, file, expirationDate) => {
    const formData = new FormData();
    formData.append('file', file);
    if (expirationDate) formData.append('expirationDate', expirationDate);
    try {
      await api.uploadRequirementDocument(reqId, formData);
    } catch (err) { /* silent */ }
    await loadRequirements();
  };

  const handleAck = async (reqId) => {
    try {
      await api.ackRequirementPolicy(reqId);
    } catch (err) { /* silent */ }
    await loadRequirements();
  };

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Edit Profile</h2>
      </div>
      <form onSubmit={handleSave}>
        <div className="onboard-section-label">Personal Info</div>
        <div className="form-group">
          <label>Phone</label>
          <input type="tel" value={profile?.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Address</label>
          <input type="text" value={profile?.address || ''} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Date of Birth</label>
          <input type="date" value={profile?.dob || ''} onChange={e => setProfile(p => ({ ...p, dob: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Gender</label>
          <select value={profile?.gender || ''} onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))}>
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
        <div className="form-group">
          <label>Preferred Language</label>
          <input type="text" value={profile?.preferredLanguage || ''} onChange={e => setProfile(p => ({ ...p, preferredLanguage: e.target.value }))} />
        </div>

        <div className="onboard-section-label">Emergency Contact</div>
        <div className="form-group">
          <label>Name</label>
          <input type="text" value={profile?.emergencyContactName || ''} onChange={e => setProfile(p => ({ ...p, emergencyContactName: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Relationship</label>
          <input type="text" value={profile?.emergencyContactRelationship || ''} onChange={e => setProfile(p => ({ ...p, emergencyContactRelationship: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input type="tel" value={profile?.emergencyContactPhone || ''} onChange={e => setProfile(p => ({ ...p, emergencyContactPhone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={profile?.emergencyContactEmail || ''} onChange={e => setProfile(p => ({ ...p, emergencyContactEmail: e.target.value }))} />
        </div>

        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </form>

      <DocumentsStep requirements={requirements} onUpload={handleUpload} />
      <CertificationsStep requirements={requirements} onUpload={handleUpload} />
      <PoliciesStep requirements={requirements} onAck={handleAck} />
    </div>
  );
}
