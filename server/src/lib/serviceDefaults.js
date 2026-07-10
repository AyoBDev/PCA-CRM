// Fallback defaults for services not present (or partially set) in the DB.
// Mirrors the frontend constants so DB-over-defaults merge is safe.
const SERVICE_DEFAULTS = {
  PCS:                 { category: 'PCS',   name: 'Personal Care Services', label: 'PCS',                      accountNumber: '71040', color: '#22c55e', timesheetSection: 'PAS',       sortOrder: 0,   enforceAuthLimit: true },
  S5130:               { category: 'PCS',   name: 'Homemaker',              label: 'S5130 — Homemaker',        accountNumber: '71120', color: '#f59e0b', timesheetSection: 'Homemaker', sortOrder: 1,   enforceAuthLimit: true },
  S5125:               { category: 'PCS',   name: 'Attendant Care',         label: 'S5125 — Attendant Care',   accountNumber: '71120', color: '#3b82f6', timesheetSection: 'PAS',       sortOrder: 2,   enforceAuthLimit: true },
  S5150:               { category: 'PCS',   name: 'Respite',                label: 'S5150 — Respite',          accountNumber: '71119', color: '#06b6d4', timesheetSection: 'Respite',   sortOrder: 3,   enforceAuthLimit: true },
  S5135:               { category: 'PCS',   name: 'Companion',              label: 'S5135 — Companion',        accountNumber: '71119', color: '#ec4899', timesheetSection: 'Companion', sortOrder: 4,   enforceAuthLimit: true },
  SDPC:                { category: 'SDPC',  name: 'Self-Directed Personal Care', label: 'SDPC',                accountNumber: '71635', color: '#8b5cf6', timesheetSection: 'PAS',       sortOrder: 5,   enforceAuthLimit: true },
  S5120:               { category: 'PCS',   name: 'Chore Services',         label: 'S5120 — Chore Services',   accountNumber: '71120', color: '#84cc16', timesheetSection: 'Homemaker', sortOrder: 6,   enforceAuthLimit: true },
  TIMESHEETS:          { category: 'TIMESHEETS', name: 'Timesheet (Private)', label: 'Timesheets (Private)',   accountNumber: '',      color: '#64748b', timesheetSection: '',          sortOrder: 50,  enforceAuthLimit: false },
  TIMESHEET_PCS:       { category: 'TIMESHEETS', name: 'Timesheet — PCS',    label: 'Timesheets-PCS',           accountNumber: '71040', color: '#22c55e', timesheetSection: 'PAS',       sortOrder: 50,  enforceAuthLimit: false },
  TIMESHEET_HOMEMAKER: { category: 'TIMESHEETS', name: 'Timesheet — Homemaker', label: 'Timesheets-Homemaker', accountNumber: '71120', color: '#f59e0b', timesheetSection: 'Homemaker', sortOrder: 50,  enforceAuthLimit: false },
  TIMESHEET_RESPITE:   { category: 'GUIDE', name: 'Respite',                label: 'Timesheets-Respite',       accountNumber: '71119', color: '#06b6d4', timesheetSection: 'Respite',   sortOrder: 50,  enforceAuthLimit: false },
  TIMESHEET_COMPANION: { category: 'TIMESHEETS', name: 'Timesheet — Companion', label: 'Timesheets-Companion Care', accountNumber: '71119', color: '#ec4899', timesheetSection: 'Companion', sortOrder: 50,  enforceAuthLimit: false },
  TIMESHEET_CHORE:     { category: 'TIMESHEETS', name: 'Timesheet — Chore',  label: 'Timesheets-Chore',         accountNumber: '71120', color: '#84cc16', timesheetSection: 'Homemaker', sortOrder: 50,  enforceAuthLimit: false },
  COPE:                { category: 'COPE',  name: 'Community Opportunities for Personal Empowerment', label: 'COPE', accountNumber: '71040', color: '#0ea5e9', timesheetSection: 'PAS',   sortOrder: 100, enforceAuthLimit: true },
  PAS:                 { category: 'PAS',   name: 'Personal Assistance Services', label: 'PAS',                accountNumber: '71040', color: '#14b8a6', timesheetSection: 'PAS',       sortOrder: 100, enforceAuthLimit: true },
};

function getDefault(code) {
  return SERVICE_DEFAULTS[code];
}

module.exports = { SERVICE_DEFAULTS, getDefault };
