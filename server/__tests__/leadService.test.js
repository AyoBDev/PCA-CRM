const {
  statusToColumn,
  columnToStatus,
  LEAD_COLUMNS,
  mapLeadToClientData,
  servicesToEnabledServices,
  convertLead,
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
    expect(d.dob).toEqual(lead.dob);
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
