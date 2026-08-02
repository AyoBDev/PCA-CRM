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

function parseServicesList(servicesRequestedJson) {
  let arr = [];
  try { arr = JSON.parse(servicesRequestedJson || '[]'); } catch { arr = []; }
  return Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : [];
}

// Human-readable schedule-needs string from a lead's days/hours/start fields.
// Reused for both the Care Plan "Schedule Needs" field and the intake summary.
function buildScheduleNeeds(lead) {
  return [
    lead.daysPerWeek && `${lead.daysPerWeek}`,
    lead.hoursPerDay && `${lead.hoursPerDay} hrs/day`,
    lead.startDateNeeded && `start ${lead.startDateNeeded}`,
  ].filter(Boolean).join(', ');
}

// Builds a human-readable "Intake Summary" block that captures every piece of
// lead intake data that has no dedicated Client field — so converting a lead
// never silently loses case manager info, referral source, schedule needs,
// case-type details, etc. Rendered on the client Notes tab (source: General).
function buildIntakeSummary(lead) {
  const lines = [];
  const add = (label, value) => {
    const v = value == null ? '' : String(value).trim();
    if (v && v !== 'No preference') lines.push(`${label}: ${v}`);
  };

  // Case manager / caseworker — the field we were dropping entirely.
  if (lead.caseworkerName || lead.caseworkerPhone) {
    add('Case Manager', [lead.caseworkerName, lead.caseworkerPhone].filter(Boolean).join(' — '));
  }
  add('Referral Source', lead.referralSource);
  add('Insurance #', lead.insuranceNumber);

  // Schedule needs.
  add('Schedule Needs', buildScheduleNeeds(lead));

  // Requested services (full list, not just the coarse enabledServices buckets).
  const services = parseServicesList(lead.servicesRequested);
  if (services.length) add('Requested Services', services.join(', '));

  // Preferences (also stored structured in caregiverRequirements; repeated here
  // so the full intake record reads as one block).
  add('Gender Preference', lead.genderPreference);
  add('Age Preference', lead.agePreference);
  add('Language', lead.languagePreference);
  if (Array.isArray(parseServicesList(lead.shiftPreferences)) && parseServicesList(lead.shiftPreferences).length) {
    add('Shift Preference', parseServicesList(lead.shiftPreferences).join(', '));
  }

  // Case-type specifics.
  if (lead.caseType === 'transfer') {
    add('Current Agency', lead.currentAgencyName);
    add('Current Auth Hours/Month', lead.currentAuthHoursMonth || '');
    add('Auth #', lead.authNumber);
    add('Transfer Reason', lead.transferReason);
    add('Transfer Notes', lead.transferNotes);
  } else if (lead.caseType === 'private') {
    if (lead.ppRate) add('Private Pay Rate', `$${lead.ppRate}/hr`);
    if (lead.ppHoursPerWeek) add('Private Pay Hours/Week', lead.ppHoursPerWeek);
    if (lead.ppDepositHours) add('Deposit Hours', lead.ppDepositHours);
  } else {
    add('Auth Status', lead.authStatus);
  }

  if (!lines.length) return '';
  return `— Intake Summary (from referral) —\n${lines.join('\n')}`;
}

function mapLeadToClientData(lead) {
  const intakeSummary = buildIntakeSummary(lead);
  const notes = [lead.callNotes, lead.scheduleNotes, intakeSummary]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join('\n\n');
  const prefs = [
    lead.genderPreference && lead.genderPreference !== 'No preference' ? lead.genderPreference : null,
    lead.agePreference && lead.agePreference !== 'No preference' ? lead.agePreference : null,
    lead.languagePreference,
  ].filter(Boolean).join(' · ');
  const services = parseServicesList(lead.servicesRequested);
  return {
    clientName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
    medicaidId: lead.medicaidId || '',
    insuranceType: lead.insuranceType || 'MEDICAID',
    address: lead.address || '',
    phone: lead.phone || '',
    secondaryPhone: lead.alternatePhone || '',
    email: lead.emergencyContactEmail || '',
    gender: lead.gender || '',
    dob: lead.dob ? new Date(lead.dob).toISOString().slice(0, 10) : '',
    doctorName: lead.doctorName || '',
    doctorPhone: lead.doctorPhone || '',
    emergencyContactName: lead.emergencyContactName || '',
    emergencyContactPhone: lead.emergencyContactPhone || '',
    emergencyContactRelation: lead.emergencyContactRelation || '',
    notes,
    // Full requested-services list, one per line (Profile tab renders on \n).
    mainServices: services.join('\n'),
    // Dedicated Care Plan "Schedule Needs" field (Care Plan Summary section).
    carePlanSchedule: buildScheduleNeeds(lead),
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
      data: {
        status: 'converted',
        preConvertStatus: lead.status,
        convertedClientId: client.id,
        convertedAt: now,
        archivedAt: now,
      },
    });
    return { client, lead: updatedLead };
  });
}

// Relations that, if present on the auto-created client, mean real work has
// started against it — so reverting the conversion (which would cascade-delete
// the client) is unsafe and must be blocked.
const CLIENT_DEPENDENCY_COUNTS = {
  authorizations: (tx, id) => tx.authorization.count({ where: { clientId: id } }),
  shifts: (tx, id) => tx.shift.count({ where: { clientId: id } }),
  timesheets: (tx, id) => tx.timesheet.count({ where: { clientId: id } }),
  clientNotes: (tx, id) => tx.clientNote.count({ where: { clientId: id } }),
  permanentLinks: (tx, id) => tx.permanentLink.count({ where: { clientId: id } }),
};

// Revert an accidental conversion: restore the lead to the board and remove the
// client record the conversion created — but only when that client is still
// "empty" (no authorizations/shifts/timesheets/notes/links). If real data was
// added since conversion, we block instead of cascade-deleting it.
async function revertConversion(prisma, id) {
  const numericId = Number(id);
  const lead = await prisma.lead.findUnique({ where: { id: numericId } });
  if (!lead) throw new Error('Lead not found');
  if (lead.status !== 'converted') throw new Error('Lead is not converted');

  return prisma.$transaction(async (tx) => {
    const clientId = lead.convertedClientId;
    let deletedClient = null;

    if (clientId) {
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (client) {
        // Guard: refuse if any real work is attached to the client.
        const entries = Object.entries(CLIENT_DEPENDENCY_COUNTS);
        const counts = await Promise.all(entries.map(([, fn]) => fn(tx, clientId)));
        const blockers = entries
          .map(([name], i) => ({ name, n: counts[i] }))
          .filter((x) => x.n > 0);
        if (blockers.length) {
          const summary = blockers.map((b) => `${b.n} ${b.name}`).join(', ');
          throw new Error(
            `Cannot move back: the client "${client.clientName}" already has ${summary}. ` +
            `Remove that data first, or archive the client instead.`
          );
        }
        await tx.client.delete({ where: { id: clientId } });
        deletedClient = { id: client.id, clientName: client.clientName };
      }
    }

    // Restore the lead to its pre-conversion stage (fallback to 'new' for
    // leads converted before we started tracking preConvertStatus).
    const restoredStatus =
      lead.preConvertStatus && lead.preConvertStatus !== 'converted'
        ? lead.preConvertStatus
        : 'new';

    const updatedLead = await tx.lead.update({
      where: { id: numericId },
      data: {
        status: restoredStatus,
        convertedClientId: null,
        convertedAt: null,
        archivedAt: null,
        dormantAt: null,
        preConvertStatus: '',
      },
    });
    return { lead: updatedLead, deletedClient };
  });
}

const DORMANT_DAYS = 90;
const STALE_WARN_DAYS = 7;
const STUCK_DAYS = 7;
const TERMINAL_OUTCOMES = ['reached_not_interested', 'wrong_number', 'went_elsewhere'];

function isTerminalOutcome(outcome) {
  return TERMINAL_OUTCOMES.includes(outcome);
}

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

module.exports = { LEAD_COLUMNS, statusToColumn, columnToStatus, mapLeadToClientData, servicesToEnabledServices, convertLead, revertConversion, computeStats, DORMANT_DAYS, sweepDormantLeads, reactivateLead, STALE_WARN_DAYS, STUCK_DAYS, TERMINAL_OUTCOMES, isTerminalOutcome };
