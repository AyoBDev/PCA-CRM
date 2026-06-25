export const PERMISSIONS = [
    { key: 'clients',         label: 'Clients',          group: 'People & Records' },
    { key: 'authorizations',  label: 'Authorizations',   group: 'People & Records' },
    { key: 'employees',       label: 'Employees',        group: 'People & Records' },
    { key: 'users',           label: 'Users',            group: 'People & Records' },
    { key: 'timesheets',      label: 'Timesheets',       group: 'Operations' },
    { key: 'permanent-links', label: 'Permanent Links',  group: 'Operations' },
    { key: 'scheduling',      label: 'Scheduling',       group: 'Operations' },
    { key: 'tasks',           label: 'Tasks',            group: 'Operations' },
    { key: 'payroll',         label: 'Payroll',          group: 'Finance' },
    { key: 'receipts',        label: 'Receipts',         group: 'Finance' },
    { key: 'messages',        label: 'Messages',         group: 'Communication' },
    { key: 'files',           label: 'Files',            group: 'Files & Data' },
    { key: 'sandata',         label: 'SANDATA Import',   group: 'Files & Data' },
    { key: 'history',         label: 'History',          group: 'Files & Data' },
    { key: 'insurance-types', label: 'Insurance Types',  group: 'Reference' },
    { key: 'services',        label: 'Services',         group: 'Reference' },
];

export const PERMISSION_KEYS = PERMISSIONS.map(p => p.key);
