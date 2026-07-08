const LEAD_COLUMNS = [
  { id: 'new',      label: 'New Lead',                   primaryStatus: 'new',               statuses: ['new'] },
  { id: 'review',   label: 'In Review',                  primaryStatus: 'review',            statuses: ['review'] },
  { id: 'waiting',  label: 'Waiting — Insurance / Docs', primaryStatus: 'waiting_insurance', statuses: ['waiting_insurance', 'waiting_docs'] },
  { id: 'quoted',   label: 'Quoted / Pending Start',     primaryStatus: 'quoted',            statuses: ['quoted', 'pending_start'] },
  { id: 'archived', label: 'Archived',                   primaryStatus: 'archived',          statuses: ['archived'] },
];

function statusToColumn(status) {
  const col = LEAD_COLUMNS.find(c => c.statuses.includes(status));
  return col ? col.id : null;
}

function columnToStatus(columnId) {
  const col = LEAD_COLUMNS.find(c => c.id === columnId);
  return col ? col.primaryStatus : null;
}

module.exports = { LEAD_COLUMNS, statusToColumn, columnToStatus };
