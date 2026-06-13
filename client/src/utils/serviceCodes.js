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
