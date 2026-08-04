const GENDER_OPTIONS = ['', 'Female', 'Male', 'Non-binary', 'Prefer not to say'];

export default function PersonalInfoStep({ value, onChange }) {
    const v = value || {};

    function set(field, val) {
        onChange({ ...v, [field]: val });
    }

    return (
        <div className="onboard-step">
            <h2 className="onboard-step-title">Personal Information</h2>
            <div className="form-group">
                <label>Address</label>
                <input type="text" value={v.address || ''} onChange={e => set('address', e.target.value)} placeholder="Street, City, State, ZIP" />
            </div>
            <div className="form-grid-2">
                <div className="form-group">
                    <label>Date of Birth</label>
                    <input type="date" value={v.dob || ''} onChange={e => set('dob', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Gender</label>
                    <select value={v.gender || ''} onChange={e => set('gender', e.target.value)}>
                        {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g || 'Select...'}</option>)}
                    </select>
                </div>
            </div>
            <div className="form-grid-2">
                <div className="form-group">
                    <label>Preferred Language</label>
                    <input type="text" value={v.preferredLanguage || ''} onChange={e => set('preferredLanguage', e.target.value)} placeholder="English" />
                </div>
                <div className="form-group">
                    <label>SSN</label>
                    <input type="text" value={v.ssn || ''} onChange={e => set('ssn', e.target.value)} placeholder="XXX-XX-XXXX" autoComplete="off" />
                </div>
            </div>
        </div>
    );
}
