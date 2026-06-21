import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then(setProfile).finally(() => setLoading(false));
  }, []);

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
        <div className="form-group">
          <label>Phone</label>
          <input type="tel" value={profile?.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Address</label>
          <input type="text" value={profile?.address || ''} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Emergency Contact</label>
          <input type="text" value={profile?.emergencyContact || ''} onChange={e => setProfile(p => ({ ...p, emergencyContact: e.target.value }))} />
        </div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
