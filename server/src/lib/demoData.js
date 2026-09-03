// ─────────────────────────────────────────────────────────────────────────────
// DEMO AGENCY DATA CATALOG
//
// A pure, dependency-free catalog of FAKE agency data used to provision the
// sales-demo tenant. No database access lives here — this module only describes
// *what* the demo contains, so it can be unit-tested and reviewed on its own.
//
// EVERYTHING HERE IS INVENTED. No name, address, phone, Medicaid ID or date is
// derived from a real client, caregiver or agency. Medicaid IDs are prefixed
// "DEMO" and emails sit on the non-routable @demo.local domain so a demo record
// can never be confused for a real one, and demo mail can never reach a person.
//
// FRESHNESS: every date is expressed as an OFFSET IN DAYS from the moment the
// demo is provisioned (negative = past, positive = future) and resolved at seed
// time. Re-running the reset therefore always yields a demo whose
// authorizations are currently open, whose shifts are in this week, and whose
// certifications are expiring on a realistic curve — the demo never goes stale.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_SLUG = 'demo';
const DEMO_AGENCY_NAME = 'Silver Sage Home Care (Demo)';
const DEMO_ADMIN_EMAIL = 'admin@demo.local';
const DEMO_ADMIN_NAME = 'Dana Reyes';
const DEMO_EMAIL_DOMAIN = 'demo.local';

// ── Date helpers ─────────────────────────────────────────────────────────────

/** A new Date `n` days from now (n may be negative). */
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** `base` + n days, as a NEW Date — never mutates `base`. */
function addDays(base, n) {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** The Sunday that starts the current week, at UTC midnight. */
function sundayOfThisWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD, the format the app stores `dob` / `dateOfService` in. */
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// ── Clients ──────────────────────────────────────────────────────────────────
// Addresses are real-looking Las Vegas street addresses chosen so the map and
// distance features have plausible geography to work with, but the
// house numbers and the residents are invented.
//
// `startsInDays` is <= 0 and `endsInDays` > 0 on every authorization so that
// every client has a CURRENTLY OPEN authorization at seed time — otherwise the
// PCA form would gate its sections off and the demo would look broken.

const DEMO_CLIENTS = [
  {
    clientName: 'Marguerite Ellison',
    medicaidId: 'DEMO-1000241',
    insuranceType: 'MEDICAID',
    address: '2841 Sunridge Heights Pkwy, Henderson, NV 89052',
    phone: '(702) 555-0141',
    dob: '1948-03-22',
    gender: 'Female',
    doctorName: 'Dr. Alicia Moreno',
    doctorPhone: '(702) 555-0190',
    emergencyContactName: 'Trevor Ellison',
    emergencyContactPhone: '(702) 555-0142',
    emergencyContactRelation: 'Son',
    enabledServices: ['PAS', 'Homemaker'],
    notes: 'Prefers morning visits. Small dog on premises.',
    authorizations: [
      { serviceCode: 'PCS', serviceName: 'Personal Care Services', authorizedUnits: 480, startsInDays: -60, endsInDays: 120 },
      { serviceCode: 'S5130', serviceName: 'Homemaker', authorizedUnits: 160, startsInDays: -60, endsInDays: 120 },
    ],
  },
  {
    clientName: 'Harold Nakamura',
    medicaidId: 'DEMO-1000318',
    insuranceType: 'Molina',
    address: '7345 W Sahara Ave, Las Vegas, NV 89117',
    phone: '(702) 555-0176',
    dob: '1939-11-08',
    gender: 'Male',
    doctorName: 'Dr. Priya Raman',
    doctorPhone: '(702) 555-0188',
    emergencyContactName: 'Susan Nakamura',
    emergencyContactPhone: '(702) 555-0177',
    emergencyContactRelation: 'Daughter',
    enabledServices: ['PAS'],
    notes: 'Hard of hearing — knock loudly.',
    authorizations: [
      { serviceCode: 'PCS', serviceName: 'Personal Care Services', authorizedUnits: 620, startsInDays: -95, endsInDays: 25 },
    ],
  },
  {
    clientName: 'Doris Whitfield',
    medicaidId: 'DEMO-1000452',
    insuranceType: 'SilverSummit',
    address: '1290 E Flamingo Rd, Las Vegas, NV 89119',
    phone: '(702) 555-0163',
    dob: '1955-06-30',
    gender: 'Female',
    doctorName: 'Dr. Marcus Bell',
    doctorPhone: '(702) 555-0195',
    emergencyContactName: 'Renee Whitfield',
    emergencyContactPhone: '(702) 555-0164',
    emergencyContactRelation: 'Sister',
    enabledServices: ['PAS', 'Homemaker', 'Respite'],
    notes: 'Respite coverage requested one weekend per month.',
    authorizations: [
      { serviceCode: 'PCS', serviceName: 'Personal Care Services', authorizedUnits: 400, startsInDays: -30, endsInDays: 150 },
      { serviceCode: 'S5150', serviceName: 'Respite', authorizedUnits: 120, startsInDays: -30, endsInDays: 150 },
    ],
  },
  {
    clientName: 'Eugene Vasquez',
    medicaidId: 'DEMO-1000577',
    insuranceType: 'MEDICAID',
    address: '4410 Spring Mountain Rd, Las Vegas, NV 89102',
    phone: '(702) 555-0128',
    dob: '1962-01-17',
    gender: 'Male',
    doctorName: 'Dr. Alicia Moreno',
    doctorPhone: '(702) 555-0190',
    emergencyContactName: 'Paula Vasquez',
    emergencyContactPhone: '(702) 555-0129',
    emergencyContactRelation: 'Spouse',
    enabledServices: ['PAS', 'Homemaker'],
    notes: 'Gate code required for entry.',
    gateCode: '4417',
    authorizations: [
      { serviceCode: 'S5125', serviceName: 'Attendant Care', authorizedUnits: 520, startsInDays: -45, endsInDays: 135 },
      { serviceCode: 'S5130', serviceName: 'Homemaker', authorizedUnits: 200, startsInDays: -45, endsInDays: 135 },
    ],
  },
  {
    clientName: 'Beatrice Okonkwo',
    medicaidId: 'DEMO-1000684',
    insuranceType: 'CareSource',
    address: '3255 N Rancho Dr, Las Vegas, NV 89130',
    phone: '(702) 555-0155',
    dob: '1944-09-05',
    gender: 'Female',
    doctorName: 'Dr. Priya Raman',
    doctorPhone: '(702) 555-0188',
    emergencyContactName: 'Daniel Okonkwo',
    emergencyContactPhone: '(702) 555-0156',
    emergencyContactRelation: 'Son',
    enabledServices: ['PAS', 'Companion'],
    notes: 'Enjoys companion visits in the afternoon.',
    authorizations: [
      { serviceCode: 'PCS', serviceName: 'Personal Care Services', authorizedUnits: 360, startsInDays: -20, endsInDays: 160 },
      { serviceCode: 'S5135', serviceName: 'Companion', authorizedUnits: 96, startsInDays: -20, endsInDays: 160 },
    ],
  },
  {
    clientName: 'Walter Brennan',
    medicaidId: 'DEMO-1000719',
    insuranceType: 'Aging and Disability',
    address: '8720 W Charleston Blvd, Las Vegas, NV 89117',
    phone: '(702) 555-0134',
    dob: '1951-12-12',
    gender: 'Male',
    doctorName: 'Dr. Marcus Bell',
    doctorPhone: '(702) 555-0195',
    emergencyContactName: 'Linda Brennan',
    emergencyContactPhone: '(702) 555-0135',
    emergencyContactRelation: 'Spouse',
    enabledServices: ['PAS'],
    notes: 'Authorization renewal due soon — good example for the renewal banner.',
    authorizations: [
      { serviceCode: 'PCS', serviceName: 'Personal Care Services', authorizedUnits: 440, startsInDays: -170, endsInDays: 12 },
    ],
  },
  {
    clientName: 'Yolanda Prieto',
    medicaidId: 'DEMO-1000833',
    insuranceType: 'MEDICAID',
    address: '5601 S Eastern Ave, Las Vegas, NV 89119',
    phone: '(702) 555-0147',
    dob: '1958-04-25',
    gender: 'Female',
    doctorName: 'Dr. Alicia Moreno',
    doctorPhone: '(702) 555-0190',
    emergencyContactName: 'Hector Prieto',
    emergencyContactPhone: '(702) 555-0148',
    emergencyContactRelation: 'Brother',
    enabledServices: ['PAS', 'Homemaker'],
    notes: '',
    authorizations: [
      { serviceCode: 'PCS', serviceName: 'Personal Care Services', authorizedUnits: 300, startsInDays: -10, endsInDays: 170 },
    ],
  },
  {
    clientName: 'Clarence Dubois',
    medicaidId: 'DEMO-1000905',
    insuranceType: 'Private Pay',
    address: '9950 W Tropicana Ave, Las Vegas, NV 89147',
    phone: '(702) 555-0182',
    dob: '1946-07-19',
    gender: 'Male',
    doctorName: 'Dr. Priya Raman',
    doctorPhone: '(702) 555-0188',
    emergencyContactName: 'Michelle Dubois',
    emergencyContactPhone: '(702) 555-0183',
    emergencyContactRelation: 'Daughter',
    enabledServices: ['PAS', 'Homemaker'],
    notes: 'Private pay — useful for showing non-Medicaid billing.',
    authorizations: [
      { serviceCode: 'S5130', serviceName: 'Homemaker', authorizedUnits: 240, startsInDays: -75, endsInDays: 105 },
    ],
  },
];

// ── Employees ────────────────────────────────────────────────────────────────
// `shiftLoad` drives how many weekly shifts the scheduler generates for this
// caregiver; 'none' leaves them unscheduled so the demo also shows an
// unassigned caregiver.

const DEMO_EMPLOYEES = [
  {
    name: 'Alicia Fernandez',
    email: `alicia.fernandez@${DEMO_EMAIL_DOMAIN}`,
    phone: '(702) 555-0201',
    dob: '1988-02-14',
    address: '3410 Palm Ridge Dr, Las Vegas, NV 89108',
    gender: 'Female',
    preferredLanguage: 'English, Spanish',
    shiftLoad: 'full',
  },
  {
    name: 'Marcus Bell',
    email: `marcus.bell@${DEMO_EMAIL_DOMAIN}`,
    phone: '(702) 555-0202',
    dob: '1991-08-03',
    address: '1180 N Buffalo Dr, Las Vegas, NV 89128',
    gender: 'Male',
    preferredLanguage: 'English',
    shiftLoad: 'full',
  },
  {
    name: 'Priya Raman',
    email: `priya.raman@${DEMO_EMAIL_DOMAIN}`,
    phone: '(702) 555-0203',
    dob: '1985-05-21',
    address: '6725 W Russell Rd, Las Vegas, NV 89148',
    gender: 'Female',
    preferredLanguage: 'English, Hindi',
    shiftLoad: 'partial',
  },
  {
    name: 'Devon Carter',
    email: `devon.carter@${DEMO_EMAIL_DOMAIN}`,
    phone: '(702) 555-0204',
    dob: '1994-11-30',
    address: '2201 S Fort Apache Rd, Las Vegas, NV 89117',
    gender: 'Male',
    preferredLanguage: 'English',
    shiftLoad: 'partial',
  },
  {
    name: 'Rosa Villanueva',
    email: `rosa.villanueva@${DEMO_EMAIL_DOMAIN}`,
    phone: '(702) 555-0205',
    dob: '1979-06-09',
    address: '4520 E Bonanza Rd, Las Vegas, NV 89110',
    gender: 'Female',
    preferredLanguage: 'English, Spanish',
    shiftLoad: 'none',
  },
];

// ── Certifications ───────────────────────────────────────────────────────────
// Deliberately spans the full reminder curve so the compliance dashboard and
// the 30-day / 7-day / expired reminder states are all demonstrable:
//   expiresInDays < 0    → expired (drives complianceStatus)
//   0..30                → inside the reminder window
//   > 60                 → healthy

const DEMO_CERTS = [
  { employeeIndex: 0, certType: 'CPR',              expiresInDays: 210 },
  { employeeIndex: 0, certType: 'TB Test',          expiresInDays: 95 },
  { employeeIndex: 1, certType: 'CPR',              expiresInDays: 18 },
  { employeeIndex: 1, certType: 'Background Check', expiresInDays: 240 },
  { employeeIndex: 2, certType: 'CPR',              expiresInDays: 5 },
  { employeeIndex: 2, certType: 'TB Test',          expiresInDays: -12 },
  { employeeIndex: 3, certType: 'CPR',              expiresInDays: 150 },
  { employeeIndex: 4, certType: 'TB Test',          expiresInDays: 300 },
];

// ── Payroll fixtures ─────────────────────────────────────────────────────────
// One imported EVV run's worth of rows. Offsets are relative to the START of
// the payroll period (the prior full week). These deliberately include a clean
// majority plus the edge cases the payroll pipeline exists to catch, so the
// All Visits tab, the void/overlap legend and the Needs Review tab are all
// non-empty in a demo.

const DEMO_PAYROLL_ROWS = [
  // Clean, verified visits.
  { clientIndex: 0, employeeIndex: 0, dayOffset: 1, callIn: '08:00', callOut: '11:00', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 0, employeeIndex: 0, dayOffset: 2, callIn: '08:00', callOut: '11:00', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 0, employeeIndex: 0, dayOffset: 3, callIn: '08:00', callOut: '11:15', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 1, employeeIndex: 1, dayOffset: 1, callIn: '09:30', callOut: '13:30', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 1, employeeIndex: 1, dayOffset: 3, callIn: '09:30', callOut: '13:30', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 2, employeeIndex: 2, dayOffset: 2, callIn: '13:00', callOut: '16:00', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 2, employeeIndex: 2, dayOffset: 4, callIn: '13:00', callOut: '16:00', serviceCode: 'S5150', visitStatus: 'Verified' },
  { clientIndex: 3, employeeIndex: 3, dayOffset: 1, callIn: '07:00', callOut: '10:00', serviceCode: 'S5125', visitStatus: 'Verified' },
  { clientIndex: 3, employeeIndex: 3, dayOffset: 2, callIn: '07:00', callOut: '10:00', serviceCode: 'S5125', visitStatus: 'Verified' },
  { clientIndex: 4, employeeIndex: 0, dayOffset: 4, callIn: '14:00', callOut: '17:00', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 5, employeeIndex: 1, dayOffset: 5, callIn: '10:00', callOut: '13:00', serviceCode: 'PCS',   visitStatus: 'Verified' },
  { clientIndex: 6, employeeIndex: 2, dayOffset: 5, callIn: '08:30', callOut: '11:30', serviceCode: 'PCS',   visitStatus: 'Verified' },

  // An early call-in / late call-out that the time rules clip.
  { clientIndex: 0, employeeIndex: 0, dayOffset: 5, callIn: '03:45', callOut: '09:00', serviceCode: 'PCS',   visitStatus: 'Verified' },

  // A very long visit that trips the daily unit cap.
  { clientIndex: 1, employeeIndex: 1, dayOffset: 5, callIn: '06:00', callOut: '18:30', serviceCode: 'PCS',   visitStatus: 'Verified' },

  // Needs Review: missing clock-out.
  { clientIndex: 2, employeeIndex: 2, dayOffset: 6, callIn: '09:00', callOut: '',      serviceCode: 'PCS',   visitStatus: 'In Process', needsReview: true, reviewReason: 'missingCallOut' },
  // Needs Review: missing caregiver.
  { clientIndex: 3, employeeIndex: null, dayOffset: 6, callIn: '10:00', callOut: '13:00', serviceCode: 'S5125', visitStatus: 'Incomplete', needsReview: true, reviewReason: 'missingEmployee' },
];

module.exports = {
  DEMO_SLUG,
  DEMO_AGENCY_NAME,
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_NAME,
  DEMO_EMAIL_DOMAIN,
  DEMO_CLIENTS,
  DEMO_EMPLOYEES,
  DEMO_CERTS,
  DEMO_PAYROLL_ROWS,
  daysFromNow,
  addDays,
  sundayOfThisWeek,
  toDateStr,
};
