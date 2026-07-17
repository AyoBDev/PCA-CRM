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

  const data = mapLeadToClientData(lead);
  return prisma.$transaction(async (tx) => {
    // Use a raw INSERT for the client row. This branch of the app predates the
    // multi-tenancy work on `main`: the live DB now has NOT NULL columns
    // (`agency_id`, `dob` as text) and typed columns Prisma's typed .create()
    // API in this branch's schema can't populate. A raw insert lets us hand
    // every required column an appropriate value (and set `dob` to '' since
    // lead intake doesn't always capture the client's birthdate).
    const rows = await tx.$queryRawUnsafe(
      `INSERT INTO clients (
         client_name, medicaid_id, insurance_type, address, phone, gate_code,
         notes, enabled_services, backup_doctor_name, backup_doctor_phone,
         critical, dob, doctor_name, doctor_phone, pa_number,
         caregiver_requirements, email, emergency_contact_name,
         emergency_contact_phone, emergency_contact_relation, gender,
         main_services, pca_notes, secondary_address, secondary_emergency_name,
         secondary_emergency_phone, secondary_emergency_relation,
         secondary_phone, client_status, agency_id, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, '',
         $6, $7, '', '',
         false, '', $8, $9, '',
         $10, $11, $12,
         $13, $14, $15,
         '', '', '', '',
         '', '',
         $16, 'active', 1, NOW(), NOW()
       )
       RETURNING *`,
      data.clientName || '',
      data.medicaidId,
      data.insuranceType,
      data.address,
      data.phone,
      data.notes,
      data.enabledServices,
      data.doctorName,
      data.doctorPhone,
      data.caregiverRequirements,
      data.email,
      data.emergencyContactName,
      data.emergencyContactPhone,
      data.emergencyContactRelation,
      data.gender,
      data.secondaryPhone,
    );
    const created = rows[0];
    // Match the shape enrichClient / callers expect (camelCase + authorizations).
    const client = {
      id: created.id,
      clientName: created.client_name,
      medicaidId: created.medicaid_id,
      insuranceType: created.insurance_type,
      address: created.address,
      phone: created.phone,
      secondaryPhone: created.secondary_phone,
      email: created.email,
      gender: created.gender,
      dob: created.dob,
      doctorName: created.doctor_name,
      doctorPhone: created.doctor_phone,
      emergencyContactName: created.emergency_contact_name,
      emergencyContactPhone: created.emergency_contact_phone,
      emergencyContactRelation: created.emergency_contact_relation,
      notes: created.notes,
      caregiverRequirements: created.caregiver_requirements,
      enabledServices: created.enabled_services,
      client_status: created.client_status,
      archivedAt: created.archived_at,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      authorizations: [],
    };
    const now = new Date();
    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: { status: 'converted', convertedClientId: client.id, convertedAt: now, archivedAt: now },
    });
    return { client, lead: updatedLead };
  });
}

const DORMANT_DAYS = 90;

async function sweepDormantLeads(prisma, now = new Date()) {
  const cutoff = new Date(now.getTime() - DORMANT_DAYS * 86400000);
  return prisma.lead.updateMany({
    where: {
      archivedAt: null,
      status: { notIn: ['converted', 'archived'] },
      updatedAt: { lt: cutoff },
    },
    data: { status: 'archived', archivedAt: now, dormantAt: now },
  });
}

async function reactivateLead(prisma, id, columnId) {
  if (!['new', 'review', 'waiting', 'quoted'].includes(columnId)) {
    throw new Error('Invalid column');
  }
  const numericId = Number(id);
  const lead = await prisma.lead.findUnique({ where: { id: numericId } });
  if (!lead) throw new Error('Lead not found');
  return prisma.lead.update({
    where: { id: numericId },
    data: {
      status: columnToStatus(columnId),
      archivedAt: null,
      dormantAt: null,
    },
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

module.exports = { LEAD_COLUMNS, statusToColumn, columnToStatus, mapLeadToClientData, servicesToEnabledServices, convertLead, computeStats, DORMANT_DAYS, sweepDormantLeads, reactivateLead };
