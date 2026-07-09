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
