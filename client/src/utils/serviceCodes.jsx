export const SERVICE_CODE_OPTIONS = [
    { group: 'EVV Services', codes: [
        { value: 'PCS', label: 'PCS' },
        { value: 'SDPC', label: 'SDPC' },
        { value: 'S5120', label: 'S5120 — Chore Services' },
        { value: 'S5125', label: 'S5125 — Attendant Care' },
        { value: 'S5130', label: 'S5130 — Homemaker' },
        { value: 'S5135', label: 'S5135 — Companion' },
        { value: 'S5150', label: 'S5150 — Respite' },
    ]},
    { group: 'Timesheet Services', codes: [
        { value: 'TIMESHEETS', label: 'Timesheets (Private)' },
        { value: 'TIMESHEET_PCS', label: 'Timesheets-PCS' },
        { value: 'TIMESHEET_HOMEMAKER', label: 'Timesheets-Homemaker' },
        { value: 'TIMESHEET_RESPITE', label: 'Timesheets-Respite' },
        { value: 'TIMESHEET_COMPANION', label: 'Timesheets-Companion Care' },
        { value: 'TIMESHEET_CHORE', label: 'Timesheets-Chore' },
    ]},
    { group: 'Programs', codes: [
        { value: 'PAS', label: 'PAS' },
        { value: 'COPE', label: 'COPE' },
    ]},
];

export const SERVICE_CATEGORIES = ['PCS', 'SDPC', 'Waiver 58', 'Waiver 48', 'Timesheets', 'COPE', 'PAS'];

export const SERVICE_NAME_SUGGESTIONS = [
    'Personal Care Services',
    'Self-Directed Personal Care',
    'Attendant Care',
    'Homemaker',
    'Chore Services',
    'Companion',
    'Respite',
    'Personal Assistance Services',
    'Community Opportunities for Personal Empowerment',
];

export function ServiceCodeSelect({ value, onChange, ...props }) {
    return (
        <select value={value} onChange={onChange} {...props}>
            {SERVICE_CODE_OPTIONS.map(group => (
                <optgroup key={group.group} label={group.group}>
                    {group.codes.map(code => (
                        <option key={code.value} value={code.value}>{code.label}</option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
}

const SERVICE_CODE_RULES = [
    { pattern: /personal care/i, code: 'PCS' },
    { pattern: /self[- ]?directed/i, code: 'SDPC' },
    { pattern: /attendant/i, code: 'S5125' },
    { pattern: /homemaker/i, code: 'S5130' },
    { pattern: /chore/i, code: 'S5120' },
    { pattern: /companion/i, code: 'S5135' },
    { pattern: /respite/i, code: 'S5150' },
];

export function deriveServiceCode(serviceName) {
    if (!serviceName) return '';
    for (const rule of SERVICE_CODE_RULES) {
        if (rule.pattern.test(serviceName)) return rule.code;
    }
    return '';
}
