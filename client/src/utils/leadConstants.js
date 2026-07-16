export const LEAD_COLUMNS = [
  { id: 'new',      label: 'New Lead',                   color: '#93c5fd', primaryStatus: 'new',               statuses: ['new'] },
  { id: 'review',   label: 'In Review',                  color: '#fcd34d', primaryStatus: 'review',            statuses: ['review'] },
  { id: 'waiting',  label: 'Waiting — Insurance / Docs', color: '#fb923c', primaryStatus: 'waiting_insurance', statuses: ['waiting_insurance', 'waiting_docs'] },
  { id: 'quoted',   label: 'Quoted / Pending Start',     color: '#a78bfa', primaryStatus: 'quoted',            statuses: ['quoted', 'pending_start'] },
  { id: 'archived', label: 'Archived',                   color: '#94a3b8', primaryStatus: 'archived',          statuses: ['archived'] },
];

export const LEAD_STATUSES = [
  { id: 'new',               label: 'New Lead',             dot: '#93c5fd', hint: 'Just called — not yet reviewed' },
  { id: 'review',            label: 'In Review',            dot: '#fcd34d', hint: 'Actively evaluating fit and availability' },
  { id: 'waiting_insurance', label: 'Waiting for Insurance', dot: '#fb923c', hint: 'Auth / eligibility check in progress' },
  { id: 'waiting_docs',      label: 'Waiting for Documents', dot: '#fb923c', hint: 'Missing paperwork from client or caseworker' },
  { id: 'quoted',            label: 'Quoted',               dot: '#a78bfa', hint: 'Rate and hours discussed with client' },
  { id: 'pending_start',     label: 'Pending Start',        dot: '#4ade80', hint: 'Ready to begin — start date confirmed' },
  { id: 'archived',          label: 'Archived',             dot: '#94a3b8', hint: 'Not moving forward' },
];

export const LEAD_CASE_TYPES = {
  initial:  { label: 'Initial',     tagClass: 'tag--initial' },
  transfer: { label: 'Transfer',    tagClass: 'tag--transfer' },
  private:  { label: 'Private Pay', tagClass: 'tag--private' },
};

export function statusToColumn(status) {
  const col = LEAD_COLUMNS.find(c => c.statuses.includes(status));
  return col ? col.id : null;
}

export function columnToStatus(colId) {
  const col = LEAD_COLUMNS.find(c => c.id === colId);
  return col ? col.primaryStatus : null;
}

export function computeDeposit({ rate, depositHours }) {
  return (Number(rate) || 0) * (Number(depositHours) || 0);
}

export function computeWeekly({ rate, hoursPerWeek }) {
  return (Number(rate) || 0) * (Number(hoursPerWeek) || 0);
}

// ── T6: view switcher + dormancy UI helpers ────────────────────────────────
// Board = kanban (active leads). List = flat sortable table (active leads).
// Dormant = auto-archived leads (see server: leadService.sweepDormantLeads).
export const LEAD_VIEWS = [
  { id: 'board',   label: 'Board' },
  { id: 'list',    label: 'List' },
  { id: 'dormant', label: 'Dormant Archive' },
];

// UI copy only — server enforces the actual threshold in leadService.
export const DORMANT_DAYS = 90;

// Whole days elapsed since the given ISO date string (or Date), floored.
export function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Returns { years: [2026, 2025, ...], monthsByYear: { 2026: Set<0..11>, ... } }
// from a list of leads keyed by their createdAt.
export function deriveDateFilterOptions(leads) {
  const monthsByYear = new Map();
  for (const l of leads) {
    if (!l?.createdAt) continue;
    const d = new Date(l.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!monthsByYear.has(y)) monthsByYear.set(y, new Set());
    monthsByYear.get(y).add(m);
  }
  const years = [...monthsByYear.keys()].sort((a, b) => b - a);
  return { years, monthsByYear };
}
