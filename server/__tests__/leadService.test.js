const {
  statusToColumn,
  columnToStatus,
  LEAD_COLUMNS,
  mapLeadToClientData,
  servicesToEnabledServices,
  convertLead,
  revertConversion,
} = require('../src/services/leadService');

describe('statusToColumn', () => {
  test('maps both waiting statuses to the waiting column', () => {
    expect(statusToColumn('waiting_insurance')).toBe('waiting');
    expect(statusToColumn('waiting_docs')).toBe('waiting');
  });
  test('maps quoted and pending_start to the quoted column', () => {
    expect(statusToColumn('quoted')).toBe('quoted');
    expect(statusToColumn('pending_start')).toBe('quoted');
  });
  test('maps new and review to their own columns', () => {
    expect(statusToColumn('new')).toBe('new');
    expect(statusToColumn('review')).toBe('review');
  });
  test('converted has no board column', () => {
    expect(statusToColumn('converted')).toBeNull();
  });
});

describe('columnToStatus', () => {
  test('returns the primary status for a column', () => {
    expect(columnToStatus('waiting')).toBe('waiting_insurance');
    expect(columnToStatus('quoted')).toBe('quoted');
    expect(columnToStatus('new')).toBe('new');
    expect(columnToStatus('archived')).toBe('archived');
  });
});

describe('LEAD_COLUMNS', () => {
  test('has exactly 5 board columns', () => {
    expect(LEAD_COLUMNS).toHaveLength(5);
    expect(LEAD_COLUMNS.map(c => c.id)).toEqual(['new', 'review', 'waiting', 'quoted', 'archived']);
  });
});

describe('servicesToEnabledServices', () => {
  test('maps ADL-type services to PAS', () => {
    const out = JSON.parse(servicesToEnabledServices('["Shower Assistance","Dressing"]'));
    expect(out).toContain('PAS');
  });
  test('maps housekeeping/meal prep to Homemaker', () => {
    const out = JSON.parse(servicesToEnabledServices('["Light Housekeeping","Meal Preparation"]'));
    expect(out).toContain('Homemaker');
  });
  test('maps companionship to Companion', () => {
    const out = JSON.parse(servicesToEnabledServices('["Companionship"]'));
    expect(out).toContain('Companion');
  });
  test('defaults to ["PAS","Homemaker"] when empty', () => {
    expect(servicesToEnabledServices('[]')).toBe('["PAS","Homemaker"]');
    expect(servicesToEnabledServices('')).toBe('["PAS","Homemaker"]');
  });
  test('produces the same ordering regardless of input service order', () => {
    const a = servicesToEnabledServices('["Shower Assistance","Meal Preparation"]');
    const b = servicesToEnabledServices('["Meal Preparation","Shower Assistance"]');
    expect(a).toBe(b);
  });
});

describe('mapLeadToClientData', () => {
  const lead = {
    firstName: 'Jane', lastName: 'Doe', phone: '7025550000', alternatePhone: '7025550001',
    address: '1 Main St', dob: new Date('1950-01-02'), gender: 'Female', medicaidId: 'M123',
    insuranceType: 'Molina Healthcare', doctorName: 'Dr. Patel', doctorPhone: '7025559999',
    emergencyContactName: 'Bob Doe', emergencyContactPhone: '7025558888', emergencyContactRelation: 'Son',
    emergencyContactEmail: 'bob@example.com', callNotes: 'Post-surgery.', scheduleNotes: 'By 8am.',
    servicesRequested: '["Shower Assistance"]',
    genderPreference: 'Female preferred', languagePreference: 'Spanish',
  };
  test('joins first+last into clientName', () => {
    expect(mapLeadToClientData(lead).clientName).toBe('Jane Doe');
  });
  test('carries insurance, phones, contact, dob', () => {
    const d = mapLeadToClientData(lead);
    expect(d.insuranceType).toBe('Molina Healthcare');
    expect(d.phone).toBe('7025550000');
    expect(d.secondaryPhone).toBe('7025550001');
    expect(d.emergencyContactName).toBe('Bob Doe');
    // Client.dob is a YYYY-MM-DD string column (encrypted at rest)
    expect(d.dob).toBe('1950-01-02');
  });
  test('derives enabledServices from servicesRequested', () => {
    expect(JSON.parse(mapLeadToClientData(lead).enabledServices)).toContain('PAS');
  });
  test('folds call + schedule notes into notes', () => {
    const d = mapLeadToClientData(lead);
    expect(d.notes).toContain('Post-surgery.');
    expect(d.notes).toContain('By 8am.');
  });
  test('summarizes preferences into caregiverRequirements', () => {
    const d = mapLeadToClientData(lead);
    expect(d.caregiverRequirements).toContain('Female preferred');
    expect(d.caregiverRequirements).toContain('Spanish');
  });

  // ── Regression: conversion must never silently drop intake data ──────────
  const richLead = {
    ...lead,
    caseworkerName: 'Carla Manager', caseworkerPhone: '7025551234',
    referralSource: 'Hospital discharge', insuranceNumber: 'INS-9988',
    daysPerWeek: '5 days (M-F)', hoursPerDay: '6', startDateNeeded: 'ASAP',
    caseType: 'transfer', currentAgencyName: 'OldCo', authNumber: 'A-77', transferReason: 'Moving',
    servicesRequested: '["Light Housekeeping","Meal Preparation","Shower Assistance"]',
    agePreference: 'Older / more experienced',
  };

  test('puts the full services-requested list into mainServices', () => {
    const d = mapLeadToClientData(richLead);
    expect(d.mainServices).toContain('Light Housekeeping');
    expect(d.mainServices).toContain('Meal Preparation');
    expect(d.mainServices).toContain('Shower Assistance');
  });

  test('preserves case manager / caseworker info in notes (no dedicated field)', () => {
    const d = mapLeadToClientData(richLead);
    expect(d.notes).toContain('Carla Manager');
    expect(d.notes).toContain('7025551234');
  });

  test('preserves referral source, insurance number, and schedule needs in notes', () => {
    const d = mapLeadToClientData(richLead);
    expect(d.notes).toContain('Hospital discharge');
    expect(d.notes).toContain('INS-9988');
    expect(d.notes).toContain('5 days (M-F)');
    expect(d.notes).toContain('ASAP');
  });

  test('preserves case-type details (transfer) in notes', () => {
    const d = mapLeadToClientData(richLead);
    expect(d.notes).toContain('OldCo');
    expect(d.notes).toContain('A-77');
  });

  test('still keeps the original call/schedule notes alongside the intake summary', () => {
    const d = mapLeadToClientData(richLead);
    expect(d.notes).toContain('Post-surgery.');
    expect(d.notes).toContain('By 8am.');
  });

  test('does not crash and produces no summary noise for an empty lead', () => {
    const d = mapLeadToClientData({ firstName: 'A', lastName: 'B' });
    expect(d.clientName).toBe('A B');
    expect(typeof d.notes).toBe('string');
    expect(typeof d.mainServices).toBe('string');
  });
});

function makeFakePrisma(lead) {
  const createdClient = { id: 99, clientName: 'Jane Doe', authorizations: [] };
  const calls = { clientCreate: null, leadUpdate: null };
  const tx = {
    client: { create: async ({ data }) => { calls.clientCreate = data; return createdClient; } },
    lead: { update: async ({ where, data }) => { calls.leadUpdate = { where, data }; return { ...lead, ...data }; } },
  };
  return {
    calls,
    lead: { findUnique: async () => lead },
    $transaction: async (fn) => fn(tx),
  };
}

describe('convertLead', () => {
  const baseLead = { id: 7, firstName: 'Jane', lastName: 'Doe', servicesRequested: '[]', status: 'quoted' };

  test('creates a client from the lead', async () => {
    const prisma = makeFakePrisma(baseLead);
    const { client } = await convertLead(prisma, 7);
    expect(client.id).toBe(99);
    expect(prisma.calls.clientCreate.clientName).toBe('Jane Doe');
  });

  test('marks the lead converted + archived + linked', async () => {
    const prisma = makeFakePrisma(baseLead);
    await convertLead(prisma, 7);
    expect(prisma.calls.leadUpdate.data.status).toBe('converted');
    expect(prisma.calls.leadUpdate.data.convertedClientId).toBe(99);
    expect(prisma.calls.leadUpdate.data.archivedAt).toBeInstanceOf(Date);
    expect(prisma.calls.leadUpdate.data.convertedAt).toBeInstanceOf(Date);
  });

  test('records the pre-conversion stage for later revert', async () => {
    const prisma = makeFakePrisma(baseLead); // status 'quoted'
    await convertLead(prisma, 7);
    expect(prisma.calls.leadUpdate.data.preConvertStatus).toBe('quoted');
  });
});

// Fake prisma for revertConversion: a converted lead pointing at a client, with
// configurable dependency counts to exercise the empty-vs-has-data guard.
function makeRevertPrisma(lead, { client = { id: 99, clientName: 'Jane Doe' }, counts = {} } = {}) {
  const calls = { clientDelete: null, leadUpdate: null };
  const zero = { authorization: 0, shift: 0, timesheet: 0, clientNote: 0, permanentLink: 0, ...counts };
  const tx = {
    client: {
      findUnique: async () => client,
      delete: async ({ where }) => { calls.clientDelete = where; return client; },
    },
    authorization: { count: async () => zero.authorization },
    shift: { count: async () => zero.shift },
    timesheet: { count: async () => zero.timesheet },
    clientNote: { count: async () => zero.clientNote },
    permanentLink: { count: async () => zero.permanentLink },
    lead: { update: async ({ where, data }) => { calls.leadUpdate = { where, data }; return { ...lead, ...data }; } },
  };
  return {
    calls,
    lead: { findUnique: async () => lead },
    $transaction: async (fn) => fn(tx),
  };
}

describe('revertConversion', () => {
  const convertedLead = { id: 7, firstName: 'Jane', lastName: 'Doe', status: 'converted', preConvertStatus: 'review', convertedClientId: 99 };

  test('restores the lead to its pre-conversion stage', async () => {
    const prisma = makeRevertPrisma(convertedLead);
    const { lead } = await revertConversion(prisma, 7);
    expect(lead.status).toBe('review');
    expect(prisma.calls.leadUpdate.data.convertedClientId).toBeNull();
    expect(prisma.calls.leadUpdate.data.convertedAt).toBeNull();
    expect(prisma.calls.leadUpdate.data.archivedAt).toBeNull();
    expect(prisma.calls.leadUpdate.data.preConvertStatus).toBe('');
  });

  test('deletes the auto-created (empty) client', async () => {
    const prisma = makeRevertPrisma(convertedLead);
    const { deletedClient } = await revertConversion(prisma, 7);
    expect(prisma.calls.clientDelete).toEqual({ id: 99 });
    expect(deletedClient).toEqual({ id: 99, clientName: 'Jane Doe' });
  });

  test('falls back to "new" when no pre-conversion stage was stored', async () => {
    const prisma = makeRevertPrisma({ ...convertedLead, preConvertStatus: '' });
    const { lead } = await revertConversion(prisma, 7);
    expect(lead.status).toBe('new');
  });

  test('blocks the revert when the client already has real data', async () => {
    const prisma = makeRevertPrisma(convertedLead, { counts: { shift: 3 } });
    await expect(revertConversion(prisma, 7)).rejects.toThrow(/Cannot move back/i);
    expect(prisma.calls.clientDelete).toBeNull(); // nothing deleted
    expect(prisma.calls.leadUpdate).toBeNull();   // lead untouched
  });

  test('throws when the lead is not converted', async () => {
    const prisma = makeRevertPrisma({ ...convertedLead, status: 'new' });
    await expect(revertConversion(prisma, 7)).rejects.toThrow(/not converted/i);
  });

  test('throws when the lead is missing', async () => {
    const prisma = makeRevertPrisma(convertedLead);
    prisma.lead.findUnique = async () => null;
    await expect(revertConversion(prisma, 7)).rejects.toThrow(/not found/i);
  });
});

describe('convertLead error cases', () => {
  const baseLead = { id: 7, firstName: 'Jane', lastName: 'Doe', servicesRequested: '[]', status: 'quoted' };

  test('throws when lead is missing', async () => {
    const prisma = makeFakePrisma(null);
    prisma.lead.findUnique = async () => null;
    await expect(convertLead(prisma, 7)).rejects.toThrow('Lead not found');
  });

  test('throws when already converted', async () => {
    const prisma = makeFakePrisma({ ...baseLead, status: 'converted' });
    await expect(convertLead(prisma, 7)).rejects.toThrow('already converted');
  });
});

const { computeStats } = require('../src/services/leadService');

describe('computeStats', () => {
  const now = new Date('2026-07-08T12:00:00Z');
  const leads = [
    { status: 'new', archivedAt: null, followUpDate: null },
    { status: 'waiting_insurance', archivedAt: null, followUpDate: new Date('2026-07-01') }, // overdue
    { status: 'waiting_insurance', archivedAt: null, followUpDate: new Date('2026-07-20') }, // future
    { status: 'converted', archivedAt: new Date('2026-07-05'), convertedAt: new Date('2026-07-05'), followUpDate: null },
    { status: 'converted', archivedAt: new Date('2026-06-05'), convertedAt: new Date('2026-06-05'), followUpDate: null },
    { status: 'archived', archivedAt: new Date('2026-07-02'), followUpDate: null },
  ];
  test('counts active (non-archived) leads as total', () => {
    expect(computeStats(leads, now).total).toBe(3);
  });
  test('counts overdue follow-ups among active leads', () => {
    expect(computeStats(leads, now).followUpOverdue).toBe(1);
  });
  test('counts active waiting-insurance leads', () => {
    expect(computeStats(leads, now).waitingInsurance).toBe(2);
  });
  test('counts conversions in the current month', () => {
    expect(computeStats(leads, now).convertedThisMonth).toBe(1);
  });
});

// ─── T2: Dormancy sweep + reactivate ───────────────────────────────────────────
const { sweepDormantLeads, reactivateLead, DORMANT_DAYS } = require('../src/services/leadService');

function makeSweepFakePrisma(capturedArgs = {}) {
  return {
    lead: {
      updateMany: async (args) => {
        capturedArgs.updateMany = args;
        // Simulate the DB affecting the number of rows the where would match.
        // Tests inspect capturedArgs.updateMany directly; we return a plausible count.
        return { count: args.__simulatedCount ?? 2 };
      },
    },
  };
}

describe('DORMANT_DAYS', () => {
  test('is set to 90 days', () => {
    expect(DORMANT_DAYS).toBe(90);
  });
});

describe('sweepDormantLeads', () => {
  test('uses a where filter that excludes archived, converted, and recently-touched leads', async () => {
    const captured = {};
    const prisma = makeSweepFakePrisma(captured);
    const now = new Date('2026-07-16T00:00:00Z');
    await sweepDormantLeads(prisma, now);
    expect(captured.updateMany).toBeDefined();
    const { where, data } = captured.updateMany;
    expect(where.archivedAt).toBeNull();
    expect(where.status).toEqual({ notIn: ['converted', 'archived'] });
    expect(where.updatedAt).toBeDefined();
    // The cutoff is exactly 90 days before `now`.
    const cutoff = new Date(now.getTime() - 90 * 86400000);
    expect(where.updatedAt.lt.getTime()).toBe(cutoff.getTime());
    // Both timestamps are set to `now`.
    expect(data.archivedAt).toEqual(now);
    expect(data.dormantAt).toEqual(now);
    expect(data.status).toBe('archived');
  });

  test('returns the update count', async () => {
    const captured = {};
    const prisma = {
      lead: {
        updateMany: async (args) => { captured.args = args; return { count: 5 }; },
      },
    };
    const result = await sweepDormantLeads(prisma, new Date('2026-07-16T00:00:00Z'));
    expect(result).toEqual({ count: 5 });
  });

  test('defaults `now` to the current time if omitted', async () => {
    const captured = {};
    const prisma = makeSweepFakePrisma(captured);
    const before = Date.now();
    await sweepDormantLeads(prisma);
    const after = Date.now();
    // The captured cutoff should be roughly 90 days before "now" (between before-90d and after-90d).
    const cutoff = captured.updateMany.where.updatedAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 90 * 86400000);
    expect(cutoff).toBeLessThanOrEqual(after - 90 * 86400000);
  });
});

function makeReactivateFakePrisma(existingLead) {
  const calls = { findUnique: null, update: null };
  return {
    calls,
    lead: {
      findUnique: async (args) => { calls.findUnique = args; return existingLead; },
      update: async (args) => { calls.update = args; return { ...existingLead, ...args.data }; },
    },
  };
}

describe('reactivateLead', () => {
  const dormant = {
    id: 42,
    status: 'archived',
    archivedAt: new Date('2026-03-01'),
    dormantAt: new Date('2026-03-01'),
  };

  test('clears archivedAt and dormantAt and sets the column\'s primary status', async () => {
    const prisma = makeReactivateFakePrisma(dormant);
    const updated = await reactivateLead(prisma, 42, 'waiting');
    expect(prisma.calls.update.where).toEqual({ id: 42 });
    expect(prisma.calls.update.data.archivedAt).toBeNull();
    expect(prisma.calls.update.data.dormantAt).toBeNull();
    expect(prisma.calls.update.data.status).toBe('waiting_insurance');
    expect(updated.status).toBe('waiting_insurance');
  });

  test('accepts every non-archived column id', async () => {
    for (const col of ['new', 'review', 'waiting', 'quoted']) {
      const prisma = makeReactivateFakePrisma(dormant);
      await reactivateLead(prisma, 42, col);
      expect(prisma.calls.update.data.status).toBeTruthy();
      expect(prisma.calls.update.data.status).not.toBe('archived');
    }
  });

  test('rejects an unknown column id', async () => {
    const prisma = makeReactivateFakePrisma(dormant);
    await expect(reactivateLead(prisma, 42, 'nope')).rejects.toThrow('Invalid column');
  });

  test('rejects the archived column id (would be a no-op reactivate)', async () => {
    const prisma = makeReactivateFakePrisma(dormant);
    await expect(reactivateLead(prisma, 42, 'archived')).rejects.toThrow('Invalid column');
  });

  test('throws Lead not found when the id is missing', async () => {
    const prisma = makeReactivateFakePrisma(null);
    await expect(reactivateLead(prisma, 99, 'new')).rejects.toThrow('Lead not found');
  });

  test('coerces the id to a Number', async () => {
    const prisma = makeReactivateFakePrisma(dormant);
    await reactivateLead(prisma, '42', 'new');
    expect(prisma.calls.findUnique).toEqual({ where: { id: 42 } });
  });
});
