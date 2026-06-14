import { useState, useEffect } from 'react';
import { api } from '../api';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getProfile().then(p => { setProfile(p); setForm({ name: p.name, phone: p.phone, email: p.email, address: p.address }); }); }, []);

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setSaved(false);
    try { const updated = await api.updateProfile(form); setProfile(updated); setSaved(true); setTimeout(() => setSaved(false), 3000); } finally { setSaving(false); }
  }

  if (!profile) return <div className="page-loading">Loading...</div>;

  return (
    <div className="profile-page">
      <h1 className="page-title">My Profile</h1>
      <form className="card" onSubmit={handleSave} style={{ padding: 16 }}>
        <label className="field-label">Name</label><input className="field-input" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <label className="field-label">Phone</label><input className="field-input" type="tel" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <label className="field-label">Email</label><input className="field-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <label className="field-label">Address</label><input className="field-input" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        <button type="submit" className="btn btn-primary btn-full" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        {saved && <p className="save-success">Profile updated</p>}
      </form>
    </div>
  );
}
