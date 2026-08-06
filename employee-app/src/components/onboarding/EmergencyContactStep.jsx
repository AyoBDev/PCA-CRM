export default function EmergencyContactStep({ value, onChange }) {
    const v = value || {};

    function set(field, val) {
        onChange({ ...v, [field]: val });
    }

    return (
        <div className="onboard-step">
            <h2 className="onboard-step-title">Emergency Contact</h2>
            <div className="form-grid-2">
                <div className="form-group">
                    <label>Contact Name</label>
                    <input type="text" value={v.emergencyContactName || ''} onChange={e => set('emergencyContactName', e.target.value)} placeholder="Full name" />
                </div>
                <div className="form-group">
                    <label>Relationship</label>
                    <input type="text" value={v.emergencyContactRelationship || ''} onChange={e => set('emergencyContactRelationship', e.target.value)} placeholder="e.g. Spouse, Parent" />
                </div>
            </div>
            <div className="form-grid-2">
                <div className="form-group">
                    <label>Phone Number</label>
                    <input type="tel" value={v.emergencyContactPhone || ''} onChange={e => set('emergencyContactPhone', e.target.value)} placeholder="(555) 555-5555" />
                </div>
                <div className="form-group">
                    <label>Email (optional)</label>
                    <input type="email" value={v.emergencyContactEmail || ''} onChange={e => set('emergencyContactEmail', e.target.value)} placeholder="name@example.com" />
                </div>
            </div>
        </div>
    );
}
