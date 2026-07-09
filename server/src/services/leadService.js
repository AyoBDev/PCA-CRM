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

const SERVICE_TO_BUCKET = [
  { bucket: 'Homemaker', match: ['housekeeping', 'meal', 'grocery', 'chore'] },
  { bucket: 'Companion', match: ['companion'] },
  { bucket: 'Respite',   match: ['respite'] },
  { bucket: 'PAS',       match: ['shower', 'bath', 'dress', 'groom', 'diaper', 'transfer', 'toilet', 'medication', 'personal care'] },
];

function servicesToEnabledServices(servicesRequestedJson) {
  let arr = [];
  try { arr = JSON.parse(servicesRequestedJson || '[]'); } catch { arr = []; }
  const buckets = new Set();
  for (const svc of arr) {
    const lower = String(svc).toLowerCase();
    for (const { bucket, match } of SERVICE_TO_BUCKET) {
      if (match.some(m => lower.includes(m))) buckets.add(bucket);
    }
  }
  if (buckets.size === 0) return '["PAS","Homemaker"]';
  return JSON.stringify([...buckets].sort());
}

function mapLeadToClientData(lead) {
  const notes = [lead.callNotes, lead.scheduleNotes].filter(Boolean).join('\n\n');
  const prefs = [
    lead.genderPreference && lead.genderPreference !== 'No preference' ? lead.genderPreference : null,
    lead.agePreference && lead.agePreference !== 'No preference' ? lead.agePreference : null,
    lead.languagePreference,
  ].filter(Boolean).join(' · ');
  return {
    clientName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
    medicaidId: lead.medicaidId || '',
    insuranceType: lead.insuranceType || 'MEDICAID',
    address: lead.address || '',
    phone: lead.phone || '',
    secondaryPhone: lead.alternatePhone || '',
    email: lead.emergencyContactEmail || '',
    gender: lead.gender || '',
    dob: lead.dob || null,
    doctorName: lead.doctorName || '',
    doctorPhone: lead.doctorPhone || '',
    emergencyContactName: lead.emergencyContactName || '',
    emergencyContactPhone: lead.emergencyContactPhone || '',
    emergencyContactRelation: lead.emergencyContactRelation || '',
    notes,
    caregiverRequirements: prefs,
    enabledServices: servicesToEnabledServices(lead.servicesRequested),
  };
}

async function convertLead(prisma, id) {
  const lead = await prisma.lead.findUnique({ where: { id: Number(id) } });
  if (!lead) throw new Error('Lead not found');
  if (lead.status === 'converted') throw new Error('Lead already converted');

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: mapLeadToClientData(lead),
      include: { authorizations: true },
    });
    const now = new Date();
    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: { status: 'converted', convertedClientId: client.id, convertedAt: now, archivedAt: now },
    });
    return { client, lead: updatedLead };
  });
}

function computeStats(leads, now = new Date()) {
  const active = leads.filter(l => !l.archivedAt);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    total: active.length,
    followUpOverdue: active.filter(l => l.followUpDate && new Date(l.followUpDate) < now).length,
    waitingInsurance: active.filter(l => l.status === 'waiting_insurance').length,
    convertedThisMonth: leads.filter(l => l.status === 'converted' && l.convertedAt && new Date(l.convertedAt) >= monthStart).length,
    archived: leads.filter(l => l.status === 'archived').length,
  };
}

module.exports = { LEAD_COLUMNS, statusToColumn, columnToStatus, mapLeadToClientData, servicesToEnabledServices, convertLead, computeStats };
