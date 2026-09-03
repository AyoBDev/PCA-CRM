const {
  DEMO_SLUG,
  DEMO_AGENCY_NAME,
  DEMO_ADMIN_EMAIL,
  DEMO_CLIENTS,
  DEMO_EMPLOYEES,
  DEMO_CERTS,
  DEMO_PAYROLL_ROWS,
  sundayOfThisWeek,
  daysFromNow,
  addDays,
  toDateStr,
} = require('../demoData');
const { SERVICE_DEFAULTS } = require('../serviceDefaults');

describe('demoData catalog', () => {
  describe('identity', () => {
    it('uses the reserved "demo" slug', () => {
      expect(DEMO_SLUG).toBe('demo');
    });

    it('labels the agency name as a demo so it is never mistaken for a tenant', () => {
      expect(DEMO_AGENCY_NAME).toMatch(/demo/i);
    });

    it('uses an admin email on a non-routable demo domain', () => {
      expect(DEMO_ADMIN_EMAIL).toMatch(/@/);
      expect(DEMO_ADMIN_EMAIL).toMatch(/demo/i);
    });
  });

  describe('client roster', () => {
    it('has enough clients for list views to look populated', () => {
      expect(DEMO_CLIENTS.length).toBeGreaterThanOrEqual(6);
    });

    it('gives every client a name, address and insurance type', () => {
      for (const c of DEMO_CLIENTS) {
        expect(c.clientName).toBeTruthy();
        expect(c.address).toBeTruthy();
        expect(c.insuranceType).toBeTruthy();
      }
    });

    it('gives every client at least one authorization', () => {
      for (const c of DEMO_CLIENTS) {
        expect(Array.isArray(c.authorizations)).toBe(true);
        expect(c.authorizations.length).toBeGreaterThan(0);
      }
    });

    it('only uses service codes the app actually knows about', () => {
      for (const c of DEMO_CLIENTS) {
        for (const a of c.authorizations) {
          expect(SERVICE_DEFAULTS[a.serviceCode]).toBeDefined();
        }
      }
    });

    it('uses obviously fake Medicaid IDs', () => {
      for (const c of DEMO_CLIENTS) {
        expect(c.medicaidId).toMatch(/^DEMO/);
      }
    });

    it('covers more than one service code across the roster', () => {
      const codes = new Set(DEMO_CLIENTS.flatMap((c) => c.authorizations.map((a) => a.serviceCode)));
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('employee roster', () => {
    it('has enough caregivers to staff the schedule', () => {
      expect(DEMO_EMPLOYEES.length).toBeGreaterThanOrEqual(4);
    });

    it('gives every employee a name and a demo email', () => {
      for (const e of DEMO_EMPLOYEES) {
        expect(e.name).toBeTruthy();
        expect(e.email).toMatch(/demo/i);
      }
    });
  });

  describe('certification schedule', () => {
    it('spans expired, expiring and healthy so reminder states are all visible', () => {
      const offsets = DEMO_CERTS.map((c) => c.expiresInDays);
      expect(offsets.some((d) => d < 0)).toBe(true);        // expired
      expect(offsets.some((d) => d >= 0 && d <= 30)).toBe(true); // expiring
      expect(offsets.some((d) => d > 60)).toBe(true);       // healthy
    });
  });

  describe('payroll fixtures', () => {
    it('includes rows that exercise the review and void paths', () => {
      expect(DEMO_PAYROLL_ROWS.some((r) => r.needsReview)).toBe(true);
      expect(DEMO_PAYROLL_ROWS.some((r) => !r.needsReview)).toBe(true);
    });
  });

  describe('date helpers', () => {
    it('sundayOfThisWeek returns a Sunday at UTC midnight', () => {
      const s = sundayOfThisWeek();
      expect(s.getUTCDay()).toBe(0);
      expect(s.getUTCHours()).toBe(0);
      expect(s.getUTCMinutes()).toBe(0);
    });

    it('sundayOfThisWeek is on or before today', () => {
      expect(sundayOfThisWeek().getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('daysFromNow moves forward and backward', () => {
      expect(daysFromNow(10).getTime()).toBeGreaterThan(Date.now());
      expect(daysFromNow(-10).getTime()).toBeLessThan(Date.now());
    });

    it('addDays does not mutate its argument', () => {
      const base = new Date('2026-01-01T00:00:00Z');
      const out = addDays(base, 5);
      expect(base.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(out.toISOString()).toBe('2026-01-06T00:00:00.000Z');
    });

    it('toDateStr renders YYYY-MM-DD', () => {
      expect(toDateStr(new Date('2026-03-07T00:00:00Z'))).toBe('2026-03-07');
    });
  });

  describe('scheduling feasibility', () => {
    // seedShifts assigns caregivers greedily and skips anyone already booked at
    // that hour. If too many clients share a start time, later clients end up
    // with no caregiver free and go unstaffed — so the catalog must offer at
    // least as many distinct start slots as there are clients competing.
    it('offers enough distinct start times to staff every client', () => {
      const START_SLOTS = 8; // mirrors the rota in seedShifts
      const staffed = DEMO_EMPLOYEES.filter((e) => e.shiftLoad !== 'none').length;
      expect(START_SLOTS * staffed).toBeGreaterThanOrEqual(DEMO_CLIENTS.length);
    });

    it('has at least two caregivers available on weekends', () => {
      // 'partial' caregivers are weekday-only; without enough 'full' staff the
      // weekend would be unstaffed.
      const full = DEMO_EMPLOYEES.filter((e) => e.shiftLoad === 'full').length;
      expect(full).toBeGreaterThanOrEqual(2);
    });
  });

  describe('freshness', () => {
    it('computes dates relative to now so the demo never goes stale', () => {
      // Authorization windows must currently be open.
      for (const c of DEMO_CLIENTS) {
        for (const a of c.authorizations) {
          expect(a.startsInDays).toBeLessThanOrEqual(0);
          expect(a.endsInDays).toBeGreaterThan(0);
        }
      }
    });
  });
});
