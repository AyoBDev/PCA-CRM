// ─── Service Code Colors (used in auth cards, scheduling badges, payroll) ───

export const AUTH_COLORS = {
    PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', border: '#22c55e', label: 'PCS — PERSONAL CARE SERVICES', icon: 'shieldCheck' },
    SDPC: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', border: '#8b5cf6', label: 'SDPC — SELF-DIRECTED PERSONAL CARE', icon: 'users' },
    S5120: { accent: '#84cc16', bg: 'hsl(82 76% 96%)', border: '#84cc16', label: 'S5120 — CHORE SERVICES', icon: 'building' },
    S5125: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', border: '#3b82f6', label: 'S5125 — ATTENDANT CARE', icon: 'user' },
    S5130: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', border: '#f59e0b', label: 'S5130 — HOMEMAKER', icon: 'building' },
    S5135: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', border: '#ec4899', label: 'S5135 — COMPANION', icon: 'users' },
    S5150: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', border: '#06b6d4', label: 'S5150 — RESPITE', icon: 'heart' },
    TIMESHEET_PCS: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', border: '#22c55e', label: 'TIMESHEET — PCS', icon: 'clipboard' },
    TIMESHEET_HOMEMAKER: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', border: '#f59e0b', label: 'TIMESHEET — HOMEMAKER', icon: 'clipboard' },
    TIMESHEET_RESPITE: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', border: '#06b6d4', label: 'TIMESHEET — RESPITE', icon: 'clipboard' },
    TIMESHEET_COMPANION: { accent: '#ec4899', bg: 'hsl(330 80% 96%)', border: '#ec4899', label: 'TIMESHEET — COMPANION', icon: 'clipboard' },
    TIMESHEET_CHORE: { accent: '#84cc16', bg: 'hsl(82 76% 96%)', border: '#84cc16', label: 'TIMESHEET — CHORE', icon: 'clipboard' },
    COPE: { accent: '#0ea5e9', bg: 'hsl(199 89% 96%)', border: '#0ea5e9', label: 'COPE', icon: 'heart' },
    PAS: { accent: '#14b8a6', bg: 'hsl(173 80% 96%)', border: '#14b8a6', label: 'PAS — PERSONAL ASSISTANCE SERVICES', icon: 'user' },
};
export const DEFAULT_AUTH_COLOR = { accent: '#64748b', bg: 'hsl(215 20% 96%)', border: '#64748b', label: 'SERVICE AUTHORIZATION', icon: 'clipboard' };

// ─── Service Code Display Names ───

export const SERVICE_CODE_NAMES = {
    PCS: 'Personal Care Services',
    SDPC: 'Self-Directed Personal Care',
    S5125: 'Attendant Care',
    S5130: 'Homemaker',
    S5135: 'Companion',
    S5150: 'Respite',
    PAS: 'Personal Assistance Services',
    COPE: 'Community Opportunities for Personal Empowerment',
    S5120: 'Chore Services',
    TIMESHEET_PCS: 'Timesheet — PCS',
    TIMESHEET_HOMEMAKER: 'Timesheet — Homemaker',
    TIMESHEET_RESPITE: 'Timesheet — Respite',
    TIMESHEET_COMPANION: 'Timesheet — Companion',
    TIMESHEET_CHORE: 'Timesheet — Chore',
};

// ─── Service Colors for scheduling badges ───

export const SERVICE_COLORS = {
    PCS:        { color: '#3B82F6', bg: '#EFF6FF', label: 'PCA' },
    S5125:      { color: '#22C55E', bg: '#F0FDF4', label: 'Attendant Care' },
    S5130:      { color: '#8B5CF6', bg: '#F5F3FF', label: 'Homemaker' },
    SDPC:       { color: '#F59E0B', bg: '#FFFBEB', label: 'SDPC' },
    S5135:      { color: '#EC4899', bg: '#FDF2F8', label: 'Companion' },
    S5150:      { color: '#06B6D4', bg: '#ECFEFF', label: 'Respite' },
    TIMESHEETS: { color: '#14B8A6', bg: '#F0FDFA', label: 'Timesheets' },
};

// ─── Simple service code accent colors (for auth page badges) ───

export const SERVICE_CODE_COLORS = {
    PCS: '#22c55e',
    SDPC: '#8b5cf6',
    S5125: '#3b82f6',
    S5130: '#f59e0b',
    S5135: '#ec4899',
    S5150: '#06b6d4',
    TIMESHEETS: '#64748b',
};

// ─── Activity Lists (PCA form + admin timesheet) ───

export const ADL_ACTIVITIES = ['Bathing', 'Dressing', 'Grooming', 'Continence', 'Toileting', 'Ambulation/Mobility', 'Transfer', 'Eating/Feeding'];
export const IADL_ACTIVITIES = ['Light Housekeeping', 'Medication Reminders', 'Laundry', 'Shopping', 'Meal Preparation B.L.D.', 'Eating/Feeding', 'Other'];
export const RESPITE_ACTIVITIES = ['Companionship', 'Safety Supervision', 'Community Activities', 'Other Approved Respite Tasks'];
export const COMPANION_ACTIVITIES = ['Companionship', 'Safety Supervision', 'Social Activities', 'Light Errands', 'Other'];

// ─── Timesheet Service Colors (PAS/HM/Respite/Companion badges on timesheet lists) ───

export const TIMESHEET_SERVICE_COLORS = {
    PAS: '#3b82f6',
    Homemaker: '#8b5cf6',
    Respite: '#06b6d4',
    Companion: '#ec4899',
};

// ─── Timesheet Status Styles ───

export const TIMESHEET_STATUS_STYLES = {
    draft: { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
    submitted: { bg: '#dbeafe', color: '#2563eb', label: 'Submitted' },
    accepted: { bg: '#dcfce7', color: '#16a34a', label: 'Accepted' },
};

// ─── Day Names ───

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_NAMES_UPPER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ─── Pagination ───

export const PAGE_SIZE = 25;

// ─── Service Code Sort Order (payroll banner, scheduling, auth pages) ───

export const SERVICE_CODE_SORT_ORDER = { PCS: 0, S5130: 1, S5125: 2, S5150: 3, S5135: 4, SDPC: 5, S5120: 6 };

// COPE/PAS program codes sort after waiver codes; sub-sorted by service name
export function getAuthSortKey(code, serviceName) {
    const MULTI_AUTH_CODES = ['COPE', 'PAS'];
    const baseCode = code && code.includes('::') ? code.split('::')[0] : code;
    if (MULTI_AUTH_CODES.includes(baseCode)) {
        const sn = (serviceName || (code && code.includes('::') ? code.split('::')[1] : '')).toLowerCase();
        if (sn.includes('personal care')) return 100;
        if (sn.includes('homemaker')) return 101;
        if (sn.includes('respite')) return 102;
        return 103;
    }
    return SERVICE_CODE_SORT_ORDER[baseCode] ?? 50;
}

// ─── Action Colors (audit log, activity drawer) ───

export const ACTION_COLORS = {
    CREATE: { bg: 'hsl(142 71% 93%)', text: 'hsl(142 71% 29%)', hex: '#16a34a', label: 'Created' },
    UPDATE: { bg: 'hsl(217 91% 93%)', text: 'hsl(217 91% 35%)', hex: '#2563eb', label: 'Updated' },
    DELETE: { bg: 'hsl(0 84% 93%)', text: 'hsl(0 84% 40%)', hex: '#dc2626', label: 'Deleted' },
    ARCHIVE: { bg: 'hsl(0 84% 93%)', text: 'hsl(0 84% 40%)', hex: '#f59e0b', label: 'Archived' },
    RESTORE: { bg: 'hsl(142 71% 93%)', text: 'hsl(142 71% 29%)', hex: '#16a34a', label: 'Restored' },
    SUBMIT: { bg: 'hsl(217 91% 93%)', text: 'hsl(217 91% 35%)', hex: '#7c3aed', label: 'Submitted' },
    PERMANENT_DELETE: { bg: 'hsl(0 84% 93%)', text: 'hsl(0 84% 40%)', hex: '#dc2626', label: 'Permanently Deleted' },
    BULK_DELETE: { bg: 'hsl(0 84% 93%)', text: 'hsl(0 84% 40%)', hex: '#dc2626', label: 'Bulk Delete' },
    BULK_UPDATE: { bg: 'hsl(217 91% 93%)', text: 'hsl(217 91% 35%)', hex: '#2563eb', label: 'Bulk Update' },
    TOGGLE_ACTIVE: { bg: 'hsl(38 92% 92%)', text: 'hsl(38 92% 35%)', hex: '#f59e0b', label: 'Toggled Active' },
    RESET_PASSWORD: { bg: 'hsl(270 60% 93%)', text: 'hsl(270 60% 35%)', hex: '#f59e0b', label: 'Password Reset' },
    LOGIN: { bg: 'hsl(220 9% 93%)', text: 'hsl(220 9% 40%)', hex: '#6b7280', label: 'Login' },
};

// ─── Certification Colors (employee) ───

export const CERT_COLORS = {
    id: '#3b82f6',
    tb: '#22c55e',
    cpr: '#f59e0b',
    training: '#8b5cf6',
    background_check: '#06b6d4',
    other: '#64748b',
};
