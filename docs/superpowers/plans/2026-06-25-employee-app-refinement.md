# Employee-App Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the five core pages of the employee-app (Home, Schedule, Requirements, Account/Availability, Messages) so they match the design spec, reuse the admin app's design system, and ship with TDD discipline.

**Architecture:** Primitives-first. Pass 0 sets up the test runner and copies design tokens. Pass 1 builds reusable hooks/components in `employee-app/src/`. Pass 2 adds two additive backend endpoints. Pass 3 assembles each of the five pages from primitives. Pass 4 is verification.

**Tech Stack:**
- Frontend: React 19, Vite, React Router 7, Vitest, @testing-library/react, jsdom
- Backend: Express, Prisma (PostgreSQL), Jest (already configured in `server/`)
- Storage: Existing `server/src/lib/storage.js` (`uploadFile`)
- Auth: JWT — employee endpoints behind `authenticate` + `requireEmployeeLink` middleware (already wired)

## Global Constraints

- Bottom nav is unchanged: Home, Schedule, Timesheet, Messages, Account.
- Requirements (Certifications) stays nested under Account at `/account/certs`.
- Reuse the admin app's design tokens, badge classes, button system, and form styles. No new color literals — only `hsl(var(--token))`.
- TDD on every primitive and backend addition: failing test → minimal implementation → refactor.
- `CERT_TYPES` (frozen order): `'TB Test', 'CPR', 'Annual Training', 'Cultural Competency', 'Infection Control', 'Background Check', 'ID', 'Other'`.
- Audit log every mutation. New cert self-upload uses `entityType: 'CertificationUpload'` (matches existing convention) and `action: 'CREATE'`.
- File constraints: `image/jpeg|image/png|image/heic|image/webp|application/pdf`, max 10 MB.
- Cert model is `EmployeeCertification` (Prisma). Cert status string values used: `'active'`, `'approved'`, `'pending'`, `'expired_replaced'`, plus derived UI states `'missing'`, `'expired'`, `'expiring'`.
- Compliance state rules:
  - `overdue` — any cert is missing OR `expirationDate < today` (and `status !== 'expired_replaced'`)
  - `attention` — none overdue, but at least one expires within 30 days OR `tasksOpen > 0`
  - `compliant` — neither of the above
- `useNotifications` polling interval: 60s while `document.visibilityState === 'visible'`. Pauses when hidden.
- Server test pattern: Jest with `jest.mock('../../lib/prisma', ...)` and `jest.mock('../../services/auditService', ...)`. No supertest, no real DB.
- Commits: never include `Co-Authored-By` or AI attribution.

---

## File Structure

### New frontend files

```
employee-app/
  vitest.config.js
  src/
    test/
      setup.js                      # vitest setup: jest-dom, mock matchMedia
      mocks/
        api.js                      # shared mocked api module
    utils/
      certTypes.js
      hoursBetween.js
      timeFormat.js                 # hhmm12 copied from admin
    hooks/
      useNotifications.jsx
      __tests__/
        useNotifications.test.jsx
    components/common/
      ComplianceBanner.jsx
      ComplianceBadge.jsx
      SummaryChip.jsx
      NextShiftCard.jsx
      WeekStrip.jsx
      ActivityFeed.jsx
      ActivityFeedItem.jsx
      CertCard.jsx
      CertSummary.jsx
      NotificationCountPill.jsx
      AvailabilityDayRow.jsx
      TimeOffRequestRow.jsx
      ScheduleWeekHeader.jsx
      __tests__/
        ComplianceBanner.test.jsx
        ComplianceBadge.test.jsx
        SummaryChip.test.jsx
        WeekStrip.test.jsx
        ActivityFeed.test.jsx
        CertCard.test.jsx
        CertSummary.test.jsx
        NotificationCountPill.test.jsx
        AvailabilityDayRow.test.jsx
        TimeOffRequestRow.test.jsx
        ScheduleWeekHeader.test.jsx
```

### Modified frontend files (pass 3 only)

- `employee-app/src/App.jsx` — wrap `ProtectedRoutes` with `NotificationsProvider`
- `employee-app/src/api.js` — add one new method for self-upload
- `employee-app/src/index.css` — token parity + new class additions
- `employee-app/src/pages/HomePage.jsx`
- `employee-app/src/pages/SchedulePage.jsx`
- `employee-app/src/pages/CertificationsPage.jsx`
- `employee-app/src/pages/AccountPage.jsx`
- `employee-app/src/pages/AvailabilityPage.jsx`
- `employee-app/src/pages/MessagesPage.jsx`
- `employee-app/package.json` — add devDeps + scripts

### New / modified backend files

- `server/src/controllers/employeePortal/homeController.js` — widen `getActivity`
- `server/src/controllers/employeePortal/requirementsController.js` — add `createCertification` (self-upload of a missing slot)
- `server/src/routes/employee.js` — register `POST /certifications`
- `server/src/controllers/employeePortal/__tests__/homeController.test.js` (new)
- `server/src/controllers/employeePortal/__tests__/requirementsController.test.js` (new)

---

## Task 1: Vitest setup + smoke test

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/vitest.config.js`
- Create: `worktrees/employee-app-refinement/employee-app/src/test/setup.js`
- Modify: `worktrees/employee-app-refinement/employee-app/package.json`
- Create: `worktrees/employee-app-refinement/employee-app/src/App.test.jsx`

**Interfaces:**
- Produces: `npm test` runs Vitest in the `employee-app/` directory.

- [ ] **Step 1: Add Vitest devDeps and scripts**

Run from `worktrees/employee-app-refinement/employee-app/`:

```bash
cd employee-app && npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Then edit `employee-app/package.json`. In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
```

- [ ] **Step 3: Create `src/test/setup.js`**

```js
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
```

- [ ] **Step 4: Write smoke test**

Create `employee-app/src/App.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });
});
```

Note: `App.jsx` already wraps its own `<Routes>`, so we render it inside `<MemoryRouter>` and let it pick the `/login` route to avoid auth gating.

- [ ] **Step 5: Run the smoke test**

```bash
cd employee-app && npm test
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add employee-app/package.json employee-app/package-lock.json employee-app/vitest.config.js employee-app/src/test/setup.js employee-app/src/App.test.jsx
git commit -m "test(employee-app): set up Vitest with smoke test"
```

---

## Task 2: Copy design tokens from admin app

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/index.css:1-22`
- Create: `worktrees/employee-app-refinement/employee-app/src/test/tokens.test.js`

**Interfaces:**
- Produces: Token set in `:root {}` matches admin app's `client/src/index.css` `:root`. Tokens consumed by all later primitives.

- [ ] **Step 1: Inspect admin tokens**

Open `client/src/index.css` and find the `:root {}` block. Record the HSL channel values for: `--primary`, `--primary-foreground`, `--foreground`, `--muted-foreground`, `--background`, `--card`, `--border`, `--success`, `--warning`, `--destructive`, `--radius`. Compare to `employee-app/src/index.css` lines 1-22.

- [ ] **Step 2: Write failing tokens test**

Create `employee-app/src/test/tokens.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

describe('design tokens', () => {
  const required = [
    '--primary',
    '--primary-foreground',
    '--foreground',
    '--muted-foreground',
    '--background',
    '--card',
    '--border',
    '--success',
    '--warning',
    '--destructive',
    '--radius',
    '--svc-pas',
    '--svc-homemaker',
    '--svc-respite',
    '--svc-companion',
  ];

  for (const token of required) {
    it(`defines ${token}`, () => {
      expect(css).toMatch(new RegExp(`${token}\\s*:`));
    });
  }

  it('uses HSL channel format (no hex literals) for primary', () => {
    const match = css.match(/--primary\s*:\s*([^;]+);/);
    expect(match).toBeTruthy();
    expect(match[1].trim()).toMatch(/^\d/);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd employee-app && npm test -- tokens.test.js
```

Expected: All `defines …` assertions pass (already defined). The "HSL channel format" assertion also passes — the file already uses `217 91% 60%`.

- [ ] **Step 4: Mirror any divergent tokens**

If any required token is missing from `employee-app/src/index.css`, add it inside the existing `:root {}` block. Copy the value from `client/src/index.css`. Re-run the test until green.

If all tokens already exist, this step is a no-op.

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/index.css employee-app/src/test/tokens.test.js
git commit -m "test(employee-app): pin design-token parity with admin app"
```

---

## Task 3: `utils/certTypes.js`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/utils/certTypes.js`
- Create: `worktrees/employee-app-refinement/employee-app/src/utils/__tests__/certTypes.test.js`

**Interfaces:**
- Produces: `CERT_TYPES` (frozen array, ordered). Consumed by `useNotifications`, `CertCard`, `CertSummary`, `CertificationsPage`, and the backend self-upload route's allowlist.

- [ ] **Step 1: Write failing test**

Create `employee-app/src/utils/__tests__/certTypes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CERT_TYPES } from '../certTypes';

describe('CERT_TYPES', () => {
  it('has 8 entries in order', () => {
    expect(CERT_TYPES).toEqual([
      'TB Test',
      'CPR',
      'Annual Training',
      'Cultural Competency',
      'Infection Control',
      'Background Check',
      'ID',
      'Other',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CERT_TYPES)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd employee-app && npm test -- certTypes
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `employee-app/src/utils/certTypes.js`:

```js
export const CERT_TYPES = Object.freeze([
  'TB Test',
  'CPR',
  'Annual Training',
  'Cultural Competency',
  'Infection Control',
  'Background Check',
  'ID',
  'Other',
]);
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd employee-app && npm test -- certTypes
```

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/utils/certTypes.js employee-app/src/utils/__tests__/certTypes.test.js
git commit -m "feat(employee-app): add CERT_TYPES constant"
```

---

## Task 4: `utils/hoursBetween.js`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/utils/hoursBetween.js`
- Create: `worktrees/employee-app-refinement/employee-app/src/utils/__tests__/hoursBetween.test.js`

**Interfaces:**
- Produces: `hoursBetween(startHHMM: string, endHHMM: string): number` — decimal hours, handles overnight by adding 24h when end < start.
- Consumed by: `WeekStrip`, `ScheduleWeekHeader`.

- [ ] **Step 1: Failing test**

```js
import { describe, it, expect } from 'vitest';
import { hoursBetween } from '../hoursBetween';

describe('hoursBetween', () => {
  it('computes simple AM-PM range', () => {
    expect(hoursBetween('09:00', '13:00')).toBe(4);
  });
  it('handles 15-minute increments', () => {
    expect(hoursBetween('09:15', '13:00')).toBe(3.75);
  });
  it('handles overnight (end < start)', () => {
    expect(hoursBetween('22:00', '02:00')).toBe(4);
  });
  it('returns 0 when inputs are missing', () => {
    expect(hoursBetween('', '13:00')).toBe(0);
    expect(hoursBetween(null, '13:00')).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```js
export function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/utils/hoursBetween.js employee-app/src/utils/__tests__/hoursBetween.test.js
git commit -m "feat(employee-app): add hoursBetween helper with overnight support"
```

---

## Task 5: `utils/timeFormat.js` (port `hhmm12`)

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/utils/timeFormat.js`
- Create: `worktrees/employee-app-refinement/employee-app/src/utils/__tests__/timeFormat.test.js`

**Interfaces:**
- Produces: `hhmm12(t: string): string` — `'14:30'` → `'2:30 PM'`.
- Consumed by: `WeekStrip`, `NextShiftCard` (later), `ScheduleWeekHeader`.

- [ ] **Step 1: Failing test**

```js
import { describe, it, expect } from 'vitest';
import { hhmm12 } from '../timeFormat';

describe('hhmm12', () => {
  it('formats afternoon time', () => {
    expect(hhmm12('14:30')).toBe('2:30 PM');
  });
  it('formats midnight as 12 AM', () => {
    expect(hhmm12('00:00')).toBe('12:00 AM');
  });
  it('formats noon as 12 PM', () => {
    expect(hhmm12('12:00')).toBe('12:00 PM');
  });
  it('returns empty string for empty input', () => {
    expect(hhmm12('')).toBe('');
    expect(hhmm12(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** (matches admin `client/src/utils/time.js`)

```js
export function hhmm12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/utils/timeFormat.js employee-app/src/utils/__tests__/timeFormat.test.js
git commit -m "feat(employee-app): port hhmm12 helper from admin app"
```

---

## Task 6: `hooks/useNotifications.jsx` + `NotificationsProvider`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/hooks/useNotifications.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/hooks/__tests__/useNotifications.test.jsx`

**Interfaces:**
- Produces:
  - `<NotificationsProvider>{children}</NotificationsProvider>` — fetches on mount, polls every 60s while visible.
  - `useNotifications()` returns: `{ certs, certsByType, certsApproved, certsPending, certsActionNeeded, certsTotal, tasksOpen, unreadMessages, complianceState, refresh, loading }`.
- Consumes: `api.getCertifications`, `api.getTasks`, `api.getMessageUnreadCount` from `../api`.

- [ ] **Step 1: Failing tests**

Create `employee-app/src/hooks/__tests__/useNotifications.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { NotificationsProvider, useNotifications } from '../useNotifications';

vi.mock('../../api', () => ({
  api: {
    getCertifications: vi.fn(),
    getTasks: vi.fn(),
    getMessageUnreadCount: vi.fn(),
  },
}));
import { api } from '../../api';

function Probe() {
  const n = useNotifications();
  if (n.loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="approved">{n.certsApproved}</span>
      <span data-testid="actionNeeded">{n.certsActionNeeded}</span>
      <span data-testid="total">{n.certsTotal}</span>
      <span data-testid="tasksOpen">{n.tasksOpen}</span>
      <span data-testid="unread">{n.unreadMessages}</span>
      <span data-testid="state">{n.complianceState}</span>
    </div>
  );
}

const today = new Date();
const inFiveDays = new Date(today.getTime() + 5 * 86400000).toISOString();
const inSixtyDays = new Date(today.getTime() + 60 * 86400000).toISOString();
const yesterday = new Date(today.getTime() - 86400000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNotifications', () => {
  it('derives counts and total=8', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [
      { id: 1, certType: 'TB Test', expirationDate: inSixtyDays, status: 'active' },
      { id: 2, certType: 'CPR', expirationDate: inFiveDays, status: 'active' },
      { id: 3, certType: 'ID', expirationDate: yesterday, status: 'active' },
    ]});
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('8'));
    expect(screen.getByTestId('approved').textContent).toBe('1');
    expect(screen.getByTestId('actionNeeded').textContent).toBe('7'); // 1 expiring + 1 expired + 5 missing
  });

  it('returns overdue when any cert is expired', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [
      { id: 1, certType: 'TB Test', expirationDate: yesterday, status: 'active' },
    ]});
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('overdue'));
  });

  it('returns attention when expiring soon and nothing expired', async () => {
    const certs = [];
    for (const t of ['TB Test','CPR','Annual Training','Cultural Competency','Infection Control','Background Check','ID','Other']) {
      certs.push({ id: certs.length+1, certType: t, expirationDate: inSixtyDays, status: 'active' });
    }
    certs[0].expirationDate = inFiveDays;
    api.getCertifications.mockResolvedValue({ certifications: certs });
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('attention'));
  });

  it('returns compliant when all 8 are valid and no open tasks', async () => {
    const certs = [];
    for (const t of ['TB Test','CPR','Annual Training','Cultural Competency','Infection Control','Background Check','ID','Other']) {
      certs.push({ id: certs.length+1, certType: t, expirationDate: inSixtyDays, status: 'active' });
    }
    api.getCertifications.mockResolvedValue({ certifications: certs });
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('compliant'));
  });

  it('keeps other slices working when one endpoint fails', async () => {
    api.getCertifications.mockRejectedValue(new Error('boom'));
    api.getTasks.mockResolvedValue([{ id: 1, completedAt: null }, { id: 2, completedAt: null }]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 3 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('tasksOpen').textContent).toBe('2'));
    expect(screen.getByTestId('unread').textContent).toBe('3');
  });

  it('counts open tasks (completedAt null)', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [] });
    api.getTasks.mockResolvedValue([
      { id: 1, completedAt: null },
      { id: 2, completedAt: '2026-06-20T00:00:00Z' },
      { id: 3, completedAt: null },
    ]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    render(<NotificationsProvider><Probe /></NotificationsProvider>);

    await waitFor(() => expect(screen.getByTestId('tasksOpen').textContent).toBe('2'));
  });

  it('refresh() re-calls the endpoints', async () => {
    api.getCertifications.mockResolvedValue({ certifications: [] });
    api.getTasks.mockResolvedValue([]);
    api.getMessageUnreadCount.mockResolvedValue({ count: 0 });

    let captured;
    function Capture() { captured = useNotifications(); return null; }
    render(<NotificationsProvider><Capture /></NotificationsProvider>);
    await waitFor(() => expect(api.getCertifications).toHaveBeenCalledTimes(1));

    await act(async () => { await captured.refresh(); });
    expect(api.getCertifications).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd employee-app && npm test -- useNotifications
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `employee-app/src/hooks/useNotifications.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CERT_TYPES } from '../utils/certTypes';
import { api } from '../api';

const Ctx = createContext(null);

function statusOfCert(cert) {
  if (!cert) return 'missing';
  if (cert.expirationDate) {
    const exp = new Date(cert.expirationDate).getTime();
    const now = Date.now();
    if (exp < now) return 'expired';
    if (exp <= now + 30 * 86400000) return 'expiring';
    return 'approved';
  }
  if (cert.status === 'active' || cert.status === 'approved') return 'approved';
  return 'pending';
}

function derive(certsArray, tasksArray, unread) {
  const certsByType = new Map();
  for (const t of CERT_TYPES) certsByType.set(t, null);
  const others = [];
  if (Array.isArray(certsArray)) {
    for (const c of certsArray) {
      if (c.status === 'expired_replaced') continue;
      if (certsByType.has(c.certType)) {
        const cur = certsByType.get(c.certType);
        if (!cur || new Date(c.updatedAt || 0) > new Date(cur.updatedAt || 0)) {
          certsByType.set(c.certType, c);
        }
      } else {
        others.push(c);
      }
    }
  }
  if (others.length) certsByType.set('Other', { certType: 'Other', others });

  let approved = 0, pending = 0, actionNeeded = 0, expiringSoon = 0, overdue = 0;
  for (const t of CERT_TYPES) {
    const cert = certsByType.get(t);
    const s = statusOfCert(cert && cert.others ? null : cert);
    if (s === 'approved') approved++;
    else if (s === 'pending') pending++;
    else { actionNeeded++; if (s === 'expiring') expiringSoon++; if (s === 'missing' || s === 'expired') overdue++; }
  }
  const tasksOpen = Array.isArray(tasksArray) ? tasksArray.filter(t => !t.completedAt).length : 0;

  let complianceState;
  if (overdue > 0) complianceState = 'overdue';
  else if (expiringSoon > 0 || tasksOpen > 0) complianceState = 'attention';
  else complianceState = 'compliant';

  return {
    certs: certsArray,
    certsByType,
    certsApproved: approved,
    certsPending: pending,
    certsActionNeeded: actionNeeded,
    certsTotal: 8,
    tasksOpen,
    unreadMessages: typeof unread === 'number' ? unread : 0,
    complianceState,
  };
}

export function NotificationsProvider({ children }) {
  const [certs, setCerts] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [unread, setUnread] = useState(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [c, t, u] = await Promise.allSettled([
        api.getCertifications(),
        api.getTasks(),
        api.getMessageUnreadCount(),
      ]);
      if (c.status === 'fulfilled') setCerts(c.value.certifications || c.value || []);
      if (t.status === 'fulfilled') setTasks(t.value || []);
      if (u.status === 'fulfilled') setUnread(typeof u.value === 'number' ? u.value : (u.value && u.value.count) || 0);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let id;
    function tick() {
      if (document.visibilityState === 'visible') refresh();
    }
    id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  const value = { ...derive(certs, tasks, (unread && unread.count) ?? unread), refresh, loading };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return v;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd employee-app && npm test -- useNotifications
```

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/hooks/useNotifications.jsx employee-app/src/hooks/__tests__/useNotifications.test.jsx
git commit -m "feat(employee-app): add useNotifications hook with compliance state"
```

---

## Task 7: Wire `NotificationsProvider` into `App.jsx`

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/App.jsx`

**Interfaces:**
- Consumes: `NotificationsProvider` from Task 6.
- Produces: All authenticated pages now have notification context.

- [ ] **Step 1: Write test that any protected page can call `useNotifications`**

Create `employee-app/src/__tests__/AppNotifications.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NotificationsProvider, useNotifications } from '../hooks/useNotifications';

vi.mock('../api', () => ({
  api: {
    getCertifications: vi.fn().mockResolvedValue({ certifications: [] }),
    getTasks: vi.fn().mockResolvedValue([]),
    getMessageUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

function Probe() {
  const { certsTotal } = useNotifications();
  return <div data-testid="total">{certsTotal}</div>;
}

describe('NotificationsProvider integration', () => {
  it('makes context available inside route tree', async () => {
    render(
      <MemoryRouter>
        <NotificationsProvider>
          <Routes>
            <Route path="/" element={<Probe />} />
          </Routes>
        </NotificationsProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('8'));
  });
});
```

- [ ] **Step 2: Run, expect PASS** (provider already exists)

```bash
cd employee-app && npm test -- AppNotifications
```

- [ ] **Step 3: Update `App.jsx`**

Replace lines 17-22 of `employee-app/src/App.jsx`:

```jsx
function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <NotificationsProvider>
      <EmployeeLayout />
    </NotificationsProvider>
  );
}
```

Add to the import block at the top:

```jsx
import { NotificationsProvider } from './hooks/useNotifications';
```

- [ ] **Step 4: Run the full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/App.jsx employee-app/src/__tests__/AppNotifications.test.jsx
git commit -m "feat(employee-app): provide NotificationsProvider to all authenticated routes"
```

---

## Task 8: `NotificationCountPill`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/NotificationCountPill.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/NotificationCountPill.test.jsx`

**Interfaces:**
- Produces: `<NotificationCountPill count={n} />`.
- Renders `null` when `count <= 0`; otherwise a `<span class="notification-pill">{count}</span>`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NotificationCountPill from '../NotificationCountPill';

describe('NotificationCountPill', () => {
  it('renders null when count is 0', () => {
    const { container } = render(<NotificationCountPill count={0} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders null when count is negative', () => {
    const { container } = render(<NotificationCountPill count={-1} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders the count when positive', () => {
    const { getByText } = render(<NotificationCountPill count={4} />);
    expect(getByText('4')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
export default function NotificationCountPill({ count }) {
  if (!count || count <= 0) return null;
  return <span className="notification-pill" aria-label={`${count} action items`}>{count}</span>;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/NotificationCountPill.jsx employee-app/src/components/common/__tests__/NotificationCountPill.test.jsx
git commit -m "feat(employee-app): add NotificationCountPill primitive"
```

---

## Task 9: `ComplianceBadge`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/ComplianceBadge.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/ComplianceBadge.test.jsx`

**Interfaces:**
- Produces: `<ComplianceBadge />` reads context, renders pill.
- Class mapping: `compliant` → `compliance-badge--compliant`, `attention` → `--attention`, `overdue` → `--overdue`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ComplianceBadge from '../ComplianceBadge';

vi.mock('../../../hooks/useNotifications', () => ({
  useNotifications: vi.fn(),
}));
import { useNotifications } from '../../../hooks/useNotifications';

function withState(state) { useNotifications.mockReturnValue({ complianceState: state }); }

describe('ComplianceBadge', () => {
  it('renders compliant', () => {
    withState('compliant');
    const { container } = render(<ComplianceBadge />);
    expect(container.querySelector('.compliance-badge--compliant')).toBeTruthy();
  });
  it('renders attention', () => {
    withState('attention');
    const { container } = render(<ComplianceBadge />);
    expect(container.querySelector('.compliance-badge--attention')).toBeTruthy();
  });
  it('renders overdue', () => {
    withState('overdue');
    const { container } = render(<ComplianceBadge />);
    expect(container.querySelector('.compliance-badge--overdue')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
import { useNotifications } from '../../hooks/useNotifications';

const LABELS = { compliant: 'Compliant', attention: 'Attention', overdue: 'Action Needed' };

export default function ComplianceBadge() {
  const { complianceState } = useNotifications();
  return (
    <span className={`compliance-badge compliance-badge--${complianceState}`}>
      {LABELS[complianceState] || ''}
    </span>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/ComplianceBadge.jsx employee-app/src/components/common/__tests__/ComplianceBadge.test.jsx
git commit -m "feat(employee-app): add ComplianceBadge primitive"
```

---

## Task 10: `ComplianceBanner`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/ComplianceBanner.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/ComplianceBanner.test.jsx`

**Interfaces:**
- Produces: `<ComplianceBanner />` — links to `/account/certs` when `complianceState === 'overdue'`; renders nothing otherwise.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComplianceBanner from '../ComplianceBanner';

vi.mock('../../../hooks/useNotifications', () => ({ useNotifications: vi.fn() }));
import { useNotifications } from '../../../hooks/useNotifications';

function renderWith(state, extra = {}) {
  useNotifications.mockReturnValue({ complianceState: state, certsActionNeeded: 2, ...extra });
  return render(<MemoryRouter><ComplianceBanner /></MemoryRouter>);
}

describe('ComplianceBanner', () => {
  it('renders only when overdue', () => {
    const { container, rerender } = renderWith('compliant');
    expect(container.firstChild).toBeNull();
    rerender(<MemoryRouter><ComplianceBanner /></MemoryRouter>);
  });
  it('renders banner when overdue with link to certs', () => {
    renderWith('overdue');
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/account/certs');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
import { Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';

export default function ComplianceBanner() {
  const { complianceState, certsActionNeeded } = useNotifications();
  if (complianceState !== 'overdue') return null;
  return (
    <Link to="/account/certs" className="alert-banner alert-banner--danger" style={{ marginBottom: 12 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {certsActionNeeded} certification{certsActionNeeded === 1 ? '' : 's'} need attention — tap to fix
    </Link>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/ComplianceBanner.jsx employee-app/src/components/common/__tests__/ComplianceBanner.test.jsx
git commit -m "feat(employee-app): add ComplianceBanner primitive"
```

---

## Task 11: `SummaryChip`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/SummaryChip.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/SummaryChip.test.jsx`

**Interfaces:**
- Produces: `<SummaryChip label="..." value={...} href? variant? icon? />`. Renders `<Link>` when `href`, `<span>` otherwise.
- `variant`: `'success' | 'warning' | 'danger' | 'neutral' (default)`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SummaryChip from '../SummaryChip';

describe('SummaryChip', () => {
  it('renders label and value', () => {
    render(<SummaryChip label="shifts" value={5} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/shifts/)).toBeInTheDocument();
  });
  it('renders as link when href is given', () => {
    render(<MemoryRouter><SummaryChip label="messages" value={2} href="/messages" /></MemoryRouter>);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/messages');
  });
  it('applies variant class', () => {
    const { container } = render(<SummaryChip label="x" value="" variant="success" />);
    expect(container.querySelector('.stat-pill--success')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
import { Link } from 'react-router-dom';

export default function SummaryChip({ label, value, href, variant = 'neutral', icon }) {
  const cls = `stat-pill ${href ? 'stat-pill--link' : ''} stat-pill--${variant}`.trim();
  const body = (
    <>
      {icon && <span style={{ marginRight: 6, display: 'inline-flex' }}>{icon}</span>}
      {value !== '' && value != null && <strong style={{ marginRight: 6 }}>{value}</strong>}
      <span>{label}</span>
    </>
  );
  return href ? <Link to={href} className={cls}>{body}</Link> : <span className={cls}>{body}</span>;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/SummaryChip.jsx employee-app/src/components/common/__tests__/SummaryChip.test.jsx
git commit -m "feat(employee-app): add SummaryChip primitive"
```

---

## Task 12: `WeekStrip`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/WeekStrip.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/WeekStrip.test.jsx`

**Interfaces:**
- Produces: `<WeekStrip shifts={[...]} weekStart="YYYY-MM-DD" />`. Renders 7 day cells. Days with shifts get `.week-strip__day--active` + hour label. The cell whose date matches today gets `.week-strip__day--today`. Clicking a cell navigates to `/schedule?date=YYYY-MM-DD`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import WeekStrip from '../WeekStrip';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

describe('WeekStrip', () => {
  it('renders 7 day cells', () => {
    const { container } = render(<MemoryRouter><WeekStrip weekStart="2026-06-21" shifts={[]} /></MemoryRouter>);
    expect(container.querySelectorAll('.week-strip__day').length).toBe(7);
  });

  it('marks today (the cell whose date == today)', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    const sundayStr = sunday.toISOString().slice(0, 10);
    const { container } = render(<MemoryRouter><WeekStrip weekStart={sundayStr} shifts={[]} /></MemoryRouter>);
    expect(container.querySelectorAll('.week-strip__day--today').length).toBe(1);
  });

  it('marks days that have shifts as active with hour total', () => {
    const shifts = [
      { shiftDate: '2026-06-22T00:00:00.000Z', startTime: '09:00', endTime: '13:00' },
      { shiftDate: '2026-06-22T00:00:00.000Z', startTime: '14:00', endTime: '16:00' },
      { shiftDate: '2026-06-24T00:00:00.000Z', startTime: '09:00', endTime: '17:00' },
    ];
    const { container, getByText } = render(<MemoryRouter><WeekStrip weekStart="2026-06-21" shifts={shifts} /></MemoryRouter>);
    expect(container.querySelectorAll('.week-strip__day--active').length).toBe(2);
    expect(getByText('6h')).toBeInTheDocument(); // 4+2 on Monday 6/22
    expect(getByText('8h')).toBeInTheDocument(); // Wednesday 6/24
  });

  it('navigates with ?date= on click', () => {
    const nav = vi.fn();
    useNavigate.mockReturnValue(nav);
    const { container } = render(<MemoryRouter><WeekStrip weekStart="2026-06-21" shifts={[]} /></MemoryRouter>);
    fireEvent.click(container.querySelectorAll('.week-strip__day')[2]);
    expect(nav).toHaveBeenCalledWith('/schedule?date=2026-06-23');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
import { useNavigate } from 'react-router-dom';
import { hoursBetween } from '../../utils/hoursBetween';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function addDays(yyyymmdd, n) {
  const d = new Date(yyyymmdd + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayLocalISO() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function WeekStrip({ weekStart, shifts = [] }) {
  const navigate = useNavigate();
  const today = todayLocalISO();
  const byDay = new Map();
  for (const s of shifts) {
    const d = (s.shiftDate || '').slice(0, 10);
    const cur = byDay.get(d) || 0;
    byDay.set(d, cur + hoursBetween(s.startTime, s.endTime));
  }
  return (
    <div className="week-strip" role="row">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const hours = byDay.get(date) || 0;
        const isToday = date === today;
        const isActive = hours > 0;
        const cls = `week-strip__day ${isToday ? 'week-strip__day--today' : ''} ${isActive ? 'week-strip__day--active' : ''}`.trim();
        return (
          <button key={date} type="button" className={cls} onClick={() => navigate(`/schedule?date=${date}`)}>
            <span className="week-strip__label">{DAYS[i]}</span>
            <span className="week-strip__date">{date.slice(8, 10).replace(/^0/, '')}</span>
            {isActive && <span className="week-strip__hours">{Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}h`}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/WeekStrip.jsx employee-app/src/components/common/__tests__/WeekStrip.test.jsx
git commit -m "feat(employee-app): add WeekStrip primitive with deep-link nav"
```

---

## Task 13: `ScheduleWeekHeader`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/ScheduleWeekHeader.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/ScheduleWeekHeader.test.jsx`

**Interfaces:**
- Produces: `<ScheduleWeekHeader shifts={[...]} />`. Renders week total hours, shift count, and per-client breakdown sorted by hours descending.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScheduleWeekHeader from '../ScheduleWeekHeader';

describe('ScheduleWeekHeader', () => {
  it('shows empty-week message when no shifts', () => {
    render(<ScheduleWeekHeader shifts={[]} />);
    expect(screen.getByText(/no shifts this week/i)).toBeInTheDocument();
  });

  it('totals hours and shift count', () => {
    const shifts = [
      { startTime: '09:00', endTime: '13:00', client: { clientName: 'Jane Doe' } },
      { startTime: '14:00', endTime: '17:00', client: { clientName: 'Jane Doe' } },
      { startTime: '09:00', endTime: '11:00', client: { clientName: 'Bob' } },
    ];
    render(<ScheduleWeekHeader shifts={shifts} />);
    expect(screen.getByText(/9 hrs/i)).toBeInTheDocument();
    expect(screen.getByText(/3 shifts/i)).toBeInTheDocument();
  });

  it('sorts breakdown by hours desc', () => {
    const shifts = [
      { startTime: '09:00', endTime: '11:00', client: { clientName: 'Alice' } },
      { startTime: '09:00', endTime: '17:00', client: { clientName: 'Bob' } },
    ];
    const { container } = render(<ScheduleWeekHeader shifts={shifts} />);
    const rows = container.querySelectorAll('.schedule-week-header__row');
    expect(rows[0].textContent).toMatch(/Bob/);
    expect(rows[1].textContent).toMatch(/Alice/);
  });

  it('handles overnight shift', () => {
    const shifts = [{ startTime: '22:00', endTime: '02:00', client: { clientName: 'X' } }];
    render(<ScheduleWeekHeader shifts={shifts} />);
    expect(screen.getByText(/4 hrs/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
import { hoursBetween } from '../../utils/hoursBetween';

function formatHours(n) {
  return Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function ScheduleWeekHeader({ shifts = [] }) {
  if (!shifts.length) {
    return (
      <div className="schedule-week-header">
        <div className="schedule-week-header__total">No shifts this week</div>
      </div>
    );
  }
  const byClient = new Map();
  let totalHours = 0;
  for (const s of shifts) {
    const h = hoursBetween(s.startTime, s.endTime);
    totalHours += h;
    const name = (s.client && s.client.clientName) || s.clientName || 'Unknown';
    byClient.set(name, (byClient.get(name) || 0) + h);
  }
  const breakdown = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="schedule-week-header">
      <div className="schedule-week-header__total">
        WEEK TOTAL · {formatHours(totalHours)} hrs · {shifts.length} shifts
      </div>
      <div className="schedule-week-header__breakdown">
        {breakdown.map(([name, h]) => (
          <div key={name} className="schedule-week-header__row">
            <span>{name}</span>
            <span>{formatHours(h)} hrs</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/ScheduleWeekHeader.jsx employee-app/src/components/common/__tests__/ScheduleWeekHeader.test.jsx
git commit -m "feat(employee-app): add ScheduleWeekHeader primitive"
```

---

## Task 14: `CertCard`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/CertCard.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/CertCard.test.jsx`

**Interfaces:**
- Produces: `<CertCard slot={{ certType, cert, status, others? }} onUpload={(file, expirationDate) => Promise<void>} />`.
- `status` is one of `'approved' | 'pending' | 'expiring' | 'expired' | 'missing'`.
- The cert-card root has class `cert-card cert-card--{status}`.
- Upload button label: `'Upload'` when `status === 'missing'`, else `'Replace'`.
- When `others` is non-empty, the card renders a list of `others` inside.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CertCard from '../CertCard';

describe('CertCard', () => {
  it('renders missing slot with Upload label', () => {
    const { container } = render(<CertCard slot={{ certType: 'TB Test', cert: null, status: 'missing' }} onUpload={vi.fn()} />);
    expect(container.querySelector('.cert-card--missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });

  it('renders approved with Replace label and expiration date', () => {
    const cert = { id: 1, certType: 'TB Test', expirationDate: '2027-01-01', updatedAt: '2026-06-01' };
    render(<CertCard slot={{ certType: 'TB Test', cert, status: 'approved' }} onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it('triggers onUpload when a file is chosen', () => {
    const onUpload = vi.fn().mockResolvedValue();
    const { container } = render(<CertCard slot={{ certType: 'CPR', cert: null, status: 'missing' }} onUpload={onUpload} />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'tb.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalled();
    expect(onUpload.mock.calls[0][0]).toBe(file);
  });

  it('lists stacked entries in the Other slot', () => {
    const others = [{ id: 10, certType: 'Background Check (Extra)' }, { id: 11, certType: 'Driver License' }];
    render(<CertCard slot={{ certType: 'Other', cert: null, status: 'missing', others }} onUpload={vi.fn()} />);
    expect(screen.getByText(/Background Check \(Extra\)/)).toBeInTheDocument();
    expect(screen.getByText(/Driver License/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
import { useRef } from 'react';

const STATUS_BADGE = {
  approved: { cls: 'badge--success', label: 'Approved' },
  pending: { cls: 'badge--muted', label: 'Pending' },
  expiring: { cls: 'badge--warning', label: 'Expiring' },
  expired: { cls: 'badge--danger', label: 'Expired' },
  missing: { cls: 'badge--danger', label: 'Missing' },
};

function fmt(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CertCard({ slot, onUpload }) {
  const { certType, cert, status, others } = slot;
  const fileRef = useRef(null);
  const badge = STATUS_BADGE[status] || STATUS_BADGE.missing;
  const isMissing = status === 'missing' && !cert;

  function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <div className={`cert-card cert-card--${status}`}>
      <div className="cert-card__header">
        <span className="cert-card__title">{certType}</span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>
      {cert && cert.expirationDate && (
        <p className="cert-card__meta">Expires: {fmt(cert.expirationDate)}</p>
      )}
      {cert && cert.updatedAt && (
        <p className="cert-card__meta">Last uploaded: {fmt(cert.updatedAt)}</p>
      )}
      {others && others.length > 0 && (
        <ul className="cert-card__others" style={{ marginTop: 8, paddingLeft: 16 }}>
          {others.map(o => <li key={o.id}>{o.certType}</li>)}
        </ul>
      )}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />
      <button type="button" className="btn btn--outline btn--sm" style={{ marginTop: 12 }} onClick={() => fileRef.current && fileRef.current.click()}>
        {isMissing ? 'Upload' : 'Replace'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/CertCard.jsx employee-app/src/components/common/__tests__/CertCard.test.jsx
git commit -m "feat(employee-app): add CertCard primitive"
```

---

## Task 15: `CertSummary`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/CertSummary.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/CertSummary.test.jsx`

**Interfaces:**
- Produces: `<CertSummary approved={n} pending={n} actionNeeded={n} total={n} />`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CertSummary from '../CertSummary';

describe('CertSummary', () => {
  it('renders all four counts', () => {
    render(<CertSummary approved={3} pending={1} actionNeeded={4} total={8} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText(/action needed/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
const TILES = [
  { key: 'approved', label: 'Approved', mod: 'approved' },
  { key: 'pending', label: 'Pending', mod: 'pending' },
  { key: 'actionNeeded', label: 'Action Needed', mod: 'action' },
  { key: 'total', label: 'Total', mod: 'total' },
];

export default function CertSummary(props) {
  return (
    <div className="cert-summary">
      {TILES.map(t => (
        <div key={t.key} className={`cert-summary__tile cert-summary__tile--${t.mod}`}>
          <div className="cert-summary__count">{props[t.key] ?? 0}</div>
          <div className="cert-summary__label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/CertSummary.jsx employee-app/src/components/common/__tests__/CertSummary.test.jsx
git commit -m "feat(employee-app): add CertSummary primitive"
```

---

## Task 16: `ActivityFeedItem` + `ActivityFeed`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/ActivityFeedItem.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/ActivityFeed.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/ActivityFeed.test.jsx`

**Interfaces:**
- Produces:
  - `<ActivityFeedItem item={{ type, title, subtitle, timestamp, href }} />`
  - `<ActivityFeed items={[...]} limit={5} />` — renders first `limit`, with a "See more" button that expands to `items.length`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityFeed from '../ActivityFeed';

function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'new-shift',
    title: `Item ${i + 1}`,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    href: '/schedule',
  }));
}

describe('ActivityFeed', () => {
  it('renders only the first `limit` items', () => {
    render(<MemoryRouter><ActivityFeed items={makeItems(10)} limit={3} /></MemoryRouter>);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
    expect(screen.queryByText('Item 4')).toBeNull();
  });

  it('expands when "See more" is clicked', () => {
    render(<MemoryRouter><ActivityFeed items={makeItems(8)} limit={3} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /see more/i }));
    expect(screen.getByText('Item 8')).toBeInTheDocument();
  });

  it('does not show "See more" when items fit', () => {
    render(<MemoryRouter><ActivityFeed items={makeItems(2)} limit={5} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /see more/i })).toBeNull();
  });

  it('renders empty state when no items', () => {
    render(<MemoryRouter><ActivityFeed items={[]} limit={5} /></MemoryRouter>);
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `ActivityFeedItem.jsx`**

```jsx
import { Link } from 'react-router-dom';

const ICONS = {
  'new-shift': '📅',
  'shift-changed': '📅',
  'admin-message': '💬',
  'cert-uploaded': '📋',
  'cert-approved': '✅',
  'cert-rejected': '⚠️',
  'task-assigned': '✅',
  'time-off-decided': '🌴',
};

function timeAgo(ts) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ActivityFeedItem({ item }) {
  const body = (
    <>
      <span className="activity-item__icon" aria-hidden>{ICONS[item.type] || '•'}</span>
      <span className="activity-item__body">
        <strong>{item.title}</strong>
        {item.subtitle && <span>{item.subtitle}</span>}
      </span>
      <span className="activity-item__time">{timeAgo(item.timestamp)}</span>
    </>
  );
  return item.href ? <Link to={item.href} className="activity-item">{body}</Link> : <div className="activity-item">{body}</div>;
}
```

- [ ] **Step 4: Implement `ActivityFeed.jsx`**

```jsx
import { useState } from 'react';
import ActivityFeedItem from './ActivityFeedItem';

export default function ActivityFeed({ items = [], limit = 5 }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) {
    return <div className="activity-feed activity-feed--empty">No recent activity</div>;
  }
  const visible = expanded ? items : items.slice(0, limit);
  const showToggle = !expanded && items.length > limit;
  return (
    <div className="activity-feed">
      {visible.map((item, idx) => <ActivityFeedItem key={item.id || idx} item={item} />)}
      {showToggle && (
        <button type="button" className="btn btn--ghost" onClick={() => setExpanded(true)}>
          See more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add employee-app/src/components/common/ActivityFeed.jsx employee-app/src/components/common/ActivityFeedItem.jsx employee-app/src/components/common/__tests__/ActivityFeed.test.jsx
git commit -m "feat(employee-app): add ActivityFeed and ActivityFeedItem primitives"
```

---

## Task 17: `NextShiftCard`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/NextShiftCard.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/NextShiftCard.test.jsx`

**Interfaces:**
- Produces: `<NextShiftCard shift={...} />`. Falls back to existing `empty-state` markup when `shift` is null.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NextShiftCard from '../NextShiftCard';

describe('NextShiftCard', () => {
  it('renders empty state when shift is null', () => {
    render(<NextShiftCard shift={null} />);
    expect(screen.getByText(/no shifts scheduled/i)).toBeInTheDocument();
  });
  it('renders client and time', () => {
    const shift = { clientName: 'Jane Doe', shiftDate: new Date().toISOString(), startTime: '09:00', endTime: '13:00', serviceCode: 'PCS' };
    render(<NextShiftCard shift={shift} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/PCS/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** (port the existing block out of HomePage)

```jsx
import { hhmm12 } from '../../utils/timeFormat';

function getServiceClass(code) {
  if (!code) return '';
  const c = code.toUpperCase();
  if (c.includes('PCS') || c.includes('PAS')) return 'pas';
  if (c.includes('S5130') || c.includes('S5120') || c.includes('HOMEMAKER')) return 'homemaker';
  if (c.includes('S5150') || c.includes('RESPITE')) return 'respite';
  if (c.includes('S5135') || c.includes('COMPANION')) return 'companion';
  return 'pas';
}

function formatShiftTime(shift) {
  const date = new Date(shift.shiftDate);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const prefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${prefix} ${hhmm12(shift.startTime)} – ${hhmm12(shift.endTime)}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function NextShiftCard({ shift }) {
  if (!shift) {
    return (
      <div className="empty-state" style={{ marginBottom: 16 }}>
        <div className="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </div>
        <p className="empty-state__text">No shifts scheduled</p>
      </div>
    );
  }
  const svc = getServiceClass(shift.serviceCode);
  return (
    <div className={`shift-card shift-card--${svc}`} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="shift-card__client" style={{ fontSize: 18 }}>{shift.clientName}</span>
        <span className={`badge badge--${svc}`}>{shift.serviceCode}</span>
      </div>
      <p className="shift-card__time">{formatShiftTime(shift)}</p>
      {shift.address && (
        <a href={mapsUrl(shift.address)} target="_blank" rel="noopener" className="shift-card__address">{shift.address}</a>
      )}
      {shift.address && (
        <a href={mapsUrl(shift.address)} target="_blank" rel="noopener" className="btn btn--primary" style={{ marginTop: 14, textDecoration: 'none' }}>Navigate</a>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/NextShiftCard.jsx employee-app/src/components/common/__tests__/NextShiftCard.test.jsx
git commit -m "feat(employee-app): extract NextShiftCard primitive"
```

---

## Task 18: `AvailabilityDayRow`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/AvailabilityDayRow.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/AvailabilityDayRow.test.jsx`

**Interfaces:**
- Produces: `<AvailabilityDayRow day="Sun" value={{ on, in, out }} onChange={(next) => void} />`.
- When `value.on === false`, the time inputs are hidden.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AvailabilityDayRow from '../AvailabilityDayRow';

describe('AvailabilityDayRow', () => {
  it('shows time inputs when on=true', () => {
    render(<AvailabilityDayRow day="Mon" value={{ on: true, in: '09:00', out: '17:00' }} onChange={vi.fn()} />);
    expect(screen.getAllByDisplayValue(/9|09/)).not.toHaveLength(0);
  });

  it('hides time inputs when on=false', () => {
    const { container } = render(<AvailabilityDayRow day="Mon" value={{ on: false, in: '', out: '' }} onChange={vi.fn()} />);
    expect(container.querySelectorAll('input[type="time"]').length).toBe(0);
  });

  it('emits onChange when toggle flips', () => {
    const onChange = vi.fn();
    const { container } = render(<AvailabilityDayRow day="Mon" value={{ on: false, in: '', out: '' }} onChange={onChange} />);
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(onChange).toHaveBeenCalledWith({ on: true, in: '09:00', out: '17:00' });
  });

  it('emits onChange when a time changes', () => {
    const onChange = vi.fn();
    const { container } = render(<AvailabilityDayRow day="Mon" value={{ on: true, in: '09:00', out: '17:00' }} onChange={onChange} />);
    fireEvent.change(container.querySelectorAll('input[type="time"]')[0], { target: { value: '10:00' } });
    expect(onChange).toHaveBeenCalledWith({ on: true, in: '10:00', out: '17:00' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
export default function AvailabilityDayRow({ day, value, onChange }) {
  return (
    <div className={`availability-day-row ${!value.on ? 'availability-day-row--off' : ''}`}>
      <label className="availability-day-row__toggle">
        <input
          type="checkbox"
          checked={!!value.on}
          onChange={() => onChange({ on: !value.on, in: value.on ? '' : (value.in || '09:00'), out: value.on ? '' : (value.out || '17:00') })}
        />
        <span>{day}</span>
      </label>
      {value.on && (
        <div className="availability-day-row__times">
          <input type="time" value={value.in || ''} onChange={e => onChange({ ...value, in: e.target.value })} />
          <span>to</span>
          <input type="time" value={value.out || ''} onChange={e => onChange({ ...value, out: e.target.value })} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/AvailabilityDayRow.jsx employee-app/src/components/common/__tests__/AvailabilityDayRow.test.jsx
git commit -m "feat(employee-app): add AvailabilityDayRow primitive"
```

---

## Task 19: `TimeOffRequestRow`

**Files:**
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/TimeOffRequestRow.jsx`
- Create: `worktrees/employee-app-refinement/employee-app/src/components/common/__tests__/TimeOffRequestRow.test.jsx`

**Interfaces:**
- Produces: `<TimeOffRequestRow request={{ startDate, endDate, reason, status }} />`.
- Status badge mapping: `pending → badge--warning`, `approved → badge--success`, `denied → badge--danger`.

- [ ] **Step 1: Failing tests**

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimeOffRequestRow from '../TimeOffRequestRow';

describe('TimeOffRequestRow', () => {
  it('renders dates, reason, and pending badge', () => {
    const { container } = render(<TimeOffRequestRow request={{ startDate: '2026-07-04', endDate: '2026-07-06', reason: 'Vacation', status: 'pending' }} />);
    expect(screen.getByText(/Vacation/)).toBeInTheDocument();
    expect(container.querySelector('.badge--warning')).toBeTruthy();
  });
  it('maps approved → success', () => {
    const { container } = render(<TimeOffRequestRow request={{ startDate: '2026-07-04', endDate: '2026-07-04', reason: '', status: 'approved' }} />);
    expect(container.querySelector('.badge--success')).toBeTruthy();
  });
  it('maps denied → danger', () => {
    const { container } = render(<TimeOffRequestRow request={{ startDate: '2026-07-04', endDate: '2026-07-04', reason: '', status: 'denied' }} />);
    expect(container.querySelector('.badge--danger')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```jsx
const BADGE_CLASS = { pending: 'badge--warning', approved: 'badge--success', denied: 'badge--danger' };

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TimeOffRequestRow({ request }) {
  const cls = BADGE_CLASS[request.status] || 'badge--muted';
  const range = request.startDate === request.endDate ? fmt(request.startDate) : `${fmt(request.startDate)} – ${fmt(request.endDate)}`;
  return (
    <div className="timeoff-row">
      <div className="timeoff-row__dates">{range}</div>
      {request.reason && <div className="timeoff-row__reason">{request.reason}</div>}
      <span className={`badge ${cls}`}>{request.status}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/components/common/TimeOffRequestRow.jsx employee-app/src/components/common/__tests__/TimeOffRequestRow.test.jsx
git commit -m "feat(employee-app): add TimeOffRequestRow primitive"
```

---

## Task 20: CSS additions to `index.css`

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/index.css` (append-only)

**Interfaces:**
- Produces: New classes used by all primitives. Existing classes untouched.

- [ ] **Step 1: Append the new section**

Append to the end of `employee-app/src/index.css`:

```css
/* === REFINEMENT (2026-06) === */

/* Cert summary tiles */
.cert-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
.cert-summary__tile { background: hsl(var(--card)); border: 1.5px solid hsl(var(--border)); border-radius: var(--radius); padding: 12px; text-align: center; }
.cert-summary__tile--approved { border-top: 3px solid hsl(var(--success)); }
.cert-summary__tile--pending { border-top: 3px solid hsl(var(--muted-foreground)); }
.cert-summary__tile--action { border-top: 3px solid hsl(var(--destructive)); }
.cert-summary__tile--total { border-top: 3px solid hsl(var(--primary)); }
.cert-summary__count { font-size: 22px; font-weight: 800; }
.cert-summary__label { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: hsl(var(--muted-foreground)); margin-top: 4px; }

/* Cert card status borders */
.cert-card--missing { border-left-color: hsl(var(--destructive)); }
.cert-card--expired { border-left-color: hsl(var(--destructive)); }
.cert-card--expiring { border-left-color: hsl(var(--warning)); }
.cert-card--approved { border-left-color: hsl(var(--success)); }
.cert-card--pending { border-left-color: hsl(var(--muted-foreground)); }

/* Week strip */
.week-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 8px; }
.week-strip__day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border: 1.5px solid hsl(var(--border)); background: hsl(var(--card)); border-radius: 8px; cursor: pointer; min-height: 60px; color: hsl(var(--foreground)); font-family: inherit; }
.week-strip__day--active { background: hsl(var(--primary)); color: white; border-color: hsl(var(--primary)); }
.week-strip__day--today { box-shadow: 0 0 0 2px hsl(var(--primary)); }
.week-strip__label { font-size: 10px; font-weight: 700; text-transform: uppercase; }
.week-strip__date { font-size: 14px; font-weight: 700; }
.week-strip__hours { font-size: 10px; font-weight: 600; }

/* Activity feed */
.activity-feed { display: flex; flex-direction: column; gap: 4px; }
.activity-feed--empty { color: hsl(var(--muted-foreground)); padding: 16px; text-align: center; font-size: 13px; }
.activity-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: hsl(var(--card)); border: 1.5px solid hsl(var(--border)); border-radius: var(--radius); text-decoration: none; color: hsl(var(--foreground)); }
.activity-item__icon { font-size: 16px; flex-shrink: 0; }
.activity-item__body { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.activity-item__time { font-size: 11px; color: hsl(var(--muted-foreground)); flex-shrink: 0; }

/* Compliance badge */
.compliance-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
.compliance-badge--compliant { background: hsl(var(--success) / 0.12); color: hsl(var(--success)); }
.compliance-badge--attention { background: hsl(var(--warning) / 0.12); color: hsl(var(--warning)); }
.compliance-badge--overdue { background: hsl(var(--destructive) / 0.12); color: hsl(var(--destructive)); }

/* Notification pill */
.notification-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: hsl(var(--destructive)); color: white; border-radius: 10px; font-size: 11px; font-weight: 700; }

/* Stat pill variants (extend existing) */
.stat-pill--success { border-color: hsl(var(--success)); color: hsl(var(--success)); }
.stat-pill--warning { border-color: hsl(var(--warning)); color: hsl(var(--warning)); }
.stat-pill--danger { border-color: hsl(var(--destructive)); color: hsl(var(--destructive)); }
.stat-pill--neutral { /* default */ }

/* Schedule week header */
.schedule-week-header { background: hsl(var(--card)); border: 1.5px solid hsl(var(--border)); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 12px; }
.schedule-week-header__total { font-size: 13px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: hsl(var(--foreground)); }
.schedule-week-header__breakdown { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.schedule-week-header__row { display: flex; justify-content: space-between; font-size: 13px; color: hsl(var(--foreground)); }

/* Availability */
.availability-day-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: hsl(var(--card)); border: 1.5px solid hsl(var(--border)); border-radius: var(--radius); margin-bottom: 6px; }
.availability-day-row--off { opacity: 0.6; }
.availability-day-row__toggle { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.availability-day-row__times { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.availability-day-row__times input[type="time"] { padding: 6px 8px; border: 1.5px solid hsl(var(--border)); border-radius: 6px; font-size: 13px; font-family: inherit; }

/* Time-off row */
.timeoff-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: hsl(var(--card)); border: 1.5px solid hsl(var(--border)); border-radius: var(--radius); margin-bottom: 6px; }
.timeoff-row__dates { font-size: 13px; font-weight: 700; }
.timeoff-row__reason { flex: 1; font-size: 13px; color: hsl(var(--muted-foreground)); }

/* Skeleton loaders */
@keyframes skeleton-shimmer { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
.skeleton { background: linear-gradient(90deg, hsl(var(--border) / 0.4) 0px, hsl(var(--border) / 0.7) 40px, hsl(var(--border) / 0.4) 80px); background-size: 200px 100%; animation: skeleton-shimmer 1.2s infinite linear; border-radius: 6px; }
.skeleton--text { height: 14px; margin-bottom: 6px; }
.skeleton--card { height: 80px; margin-bottom: 12px; }
```

- [ ] **Step 2: Re-run full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 3: Commit**

```bash
git add employee-app/src/index.css
git commit -m "style(employee-app): add CSS for new primitives (cert summary, week strip, activity feed, etc.)"
```

---

## Task 21: Backend — widen `GET /api/employee/home/activity`

**Files:**
- Modify: `worktrees/employee-app-refinement/server/src/controllers/employeePortal/homeController.js`
- Create: `worktrees/employee-app-refinement/server/src/controllers/employeePortal/__tests__/homeController.test.js`

**Interfaces:**
- Produces: `getActivity(req, res)` returns an array of `{ id, type, title, subtitle?, timestamp, href? }`, sorted by `timestamp` desc, capped at 20.
- Event types: `'new-shift' | 'shift-changed' | 'admin-message' | 'cert-uploaded' | 'cert-approved' | 'cert-rejected' | 'task-assigned' | 'time-off-decided'`.

- [ ] **Step 1: Failing test**

Create `server/src/controllers/employeePortal/__tests__/homeController.test.js`:

```js
jest.mock('../../../lib/prisma', () => ({
  shift: { findMany: jest.fn() },
  message: { findMany: jest.fn() },
  auditLog: { findMany: jest.fn() },
  employeeTask: { findMany: jest.fn() },
  timeOffRequest: { findMany: jest.fn() },
}));
const prisma = require('../../../lib/prisma');
const { getActivity } = require('../homeController');

function mockReqRes(emp = { id: 7 }) {
  const req = { employee: emp, user: { id: 11 } };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('getActivity (widened)', () => {
  test('returns mixed event types sorted desc, capped at 20', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { id: 1, shiftDate: new Date('2026-06-20'), startTime: '09:00', endTime: '13:00', createdAt: new Date('2026-06-19'), updatedAt: new Date('2026-06-19'), client: { clientName: 'Jane' } },
      { id: 2, shiftDate: new Date('2026-06-22'), startTime: '09:00', endTime: '13:00', createdAt: new Date('2026-06-18'), updatedAt: new Date('2026-06-21'), client: { clientName: 'Bob' } },
    ]);
    prisma.message.findMany.mockResolvedValue([
      { id: 5, content: 'Hello', createdAt: new Date('2026-06-21'), senderRole: 'admin' },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 9, action: 'CREATE', entityType: 'CertificationUpload', entityName: 'CPR.pdf', createdAt: new Date('2026-06-20'), metadata: { employeeId: 7 } },
    ]);
    prisma.employeeTask.findMany.mockResolvedValue([
      { id: 12, title: 'Sign handbook', createdAt: new Date('2026-06-19') },
    ]);
    prisma.timeOffRequest.findMany.mockResolvedValue([
      { id: 22, startDate: '2026-07-04', endDate: '2026-07-06', status: 'approved', decidedAt: new Date('2026-06-22') },
    ]);

    const { req, res } = mockReqRes();
    await getActivity(req, res);

    const out = res.json.mock.calls[0][0];
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);

    const types = new Set(out.map(x => x.type));
    expect(types.has('admin-message')).toBe(true);
    expect(types.has('cert-uploaded')).toBe(true);
    expect(types.has('task-assigned')).toBe(true);
    expect(types.has('time-off-decided')).toBe(true);

    const tsAsNumbers = out.map(x => new Date(x.timestamp).getTime());
    for (let i = 1; i < tsAsNumbers.length; i++) expect(tsAsNumbers[i-1]).toBeGreaterThanOrEqual(tsAsNumbers[i]);
  });

  test('scopes shift queries to the authenticated employee', async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.employeeTask.findMany.mockResolvedValue([]);
    prisma.timeOffRequest.findMany.mockResolvedValue([]);

    const { req, res } = mockReqRes({ id: 42 });
    await getActivity(req, res);
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: 42 }) }));
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd server && npx jest --testPathPattern=homeController -v
```

Expected: tests fail because the new code path doesn't exist.

- [ ] **Step 3: Implement (replace `getActivity` only)**

In `server/src/controllers/employeePortal/homeController.js`, replace the existing `getActivity` with:

```js
async function getActivity(req, res) {
  const employeeId = req.employee.id;
  const since = new Date(Date.now() - 14 * 86400000);

  const [shifts, messages, auditLogs, tasks, timeOff] = await Promise.all([
    prisma.shift.findMany({
      where: { employeeId, OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] },
      include: { client: { select: { clientName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.message.findMany({
      where: { recipientEmployeeId: employeeId, senderRole: 'admin', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => []),
    prisma.auditLog.findMany({
      where: {
        entityType: { in: ['CertificationUpload', 'EmployeeCertification'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }).catch(() => []),
    prisma.employeeTask.findMany({
      where: { employeeId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.timeOffRequest.findMany({
      where: { employeeId, decidedAt: { gte: since, not: null } },
      orderBy: { decidedAt: 'desc' },
      take: 20,
    }).catch(() => []),
  ]);

  const items = [];

  for (const s of shifts) {
    const isNew = +s.createdAt >= +since;
    const isChanged = +s.updatedAt > +s.createdAt;
    items.push({
      id: `shift-${s.id}-${isChanged ? 'u' : 'c'}`,
      type: isChanged ? 'shift-changed' : 'new-shift',
      title: isChanged ? 'Shift updated' : 'New shift assigned',
      subtitle: `${s.client?.clientName || ''} · ${new Date(s.shiftDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      timestamp: (isChanged ? s.updatedAt : s.createdAt).toISOString(),
      href: '/schedule',
    });
  }

  for (const m of messages) {
    items.push({
      id: `msg-${m.id}`,
      type: 'admin-message',
      title: 'Message from Office',
      subtitle: m.content.slice(0, 80),
      timestamp: new Date(m.createdAt).toISOString(),
      href: '/messages',
    });
  }

  for (const a of auditLogs) {
    if (a.metadata && a.metadata.employeeId !== employeeId) continue;
    let type = 'cert-uploaded';
    let title = 'Certification uploaded';
    if (a.action === 'UPDATE') {
      if (a.metadata && a.metadata.newStatus === 'approved') { type = 'cert-approved'; title = 'Certification approved'; }
      else if (a.metadata && a.metadata.newStatus === 'rejected') { type = 'cert-rejected'; title = 'Certification needs attention'; }
    }
    items.push({
      id: `audit-${a.id}`,
      type,
      title,
      subtitle: a.entityName,
      timestamp: new Date(a.createdAt).toISOString(),
      href: '/account/certs',
    });
  }

  for (const t of tasks) {
    items.push({
      id: `task-${t.id}`,
      type: 'task-assigned',
      title: 'New task',
      subtitle: t.title,
      timestamp: new Date(t.createdAt).toISOString(),
      href: '/account/tasks',
    });
  }

  for (const r of timeOff) {
    items.push({
      id: `timeoff-${r.id}`,
      type: 'time-off-decided',
      title: `Time off ${r.status}`,
      subtitle: `${new Date(r.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(r.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      timestamp: new Date(r.decidedAt).toISOString(),
      href: '/account/availability',
    });
  }

  items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(items.slice(0, 20));
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd server && npx jest --testPathPattern=homeController -v
```

- [ ] **Step 5: Run full server suite, expect PASS**

```bash
cd server && npm test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/employeePortal/homeController.js server/src/controllers/employeePortal/__tests__/homeController.test.js
git commit -m "feat(server): widen employee home/activity to unified event feed"
```

---

## Task 22: Backend — `POST /api/employee/certifications` (self-upload missing cert)

**Files:**
- Modify: `worktrees/employee-app-refinement/server/src/controllers/employeePortal/requirementsController.js`
- Modify: `worktrees/employee-app-refinement/server/src/routes/employee.js`
- Create: `worktrees/employee-app-refinement/server/src/controllers/employeePortal/__tests__/requirementsController.test.js`

**Interfaces:**
- Produces: `createCertification(req, res)` — accepts `multipart/form-data` with fields `certType`, optional `expirationDate`, and a file. Creates an `EmployeeCertification` row (status `pending`) and a `CertificationUpload` row (file in storage). Audits as `entityType: 'CertificationUpload'`, `action: 'CREATE'`.
- Route registered: `POST /certifications` inside the existing `/api/employee` router.

- [ ] **Step 1: Failing test**

Create `server/src/controllers/employeePortal/__tests__/requirementsController.test.js`:

```js
jest.mock('../../../lib/prisma', () => ({
  employeeCertification: { create: jest.fn(), findFirst: jest.fn() },
  certificationUpload: { create: jest.fn() },
  $transaction: jest.fn(async (ops) => Array.isArray(ops) ? Promise.all(ops.map(o => typeof o === 'function' ? o() : o)) : ops),
}));
jest.mock('../../../lib/storage', () => ({ uploadFile: jest.fn().mockResolvedValue() }));
jest.mock('../../../services/auditService', () => ({ logAction: jest.fn() }));

const prisma = require('../../../lib/prisma');
const { uploadFile } = require('../../../lib/storage');
const audit = require('../../../services/auditService');
const { createCertification } = require('../requirementsController');

function mockReqRes(file, body = {}) {
  const req = {
    employee: { id: 7 },
    user: { id: 11, name: 'Tester', role: 'pca' },
    file,
    body,
  };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  return { req, res };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('createCertification', () => {
  test('rejects when no file is provided', async () => {
    const { req, res } = mockReqRes(undefined, { certType: 'CPR' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects unknown certType', async () => {
    const { req, res } = mockReqRes({ originalname: 'cpr.pdf', size: 100, buffer: Buffer.from(''), mimetype: 'application/pdf' }, { certType: 'Not Real' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects oversized file', async () => {
    const { req, res } = mockReqRes({ originalname: 'big.pdf', size: 12 * 1024 * 1024, buffer: Buffer.from(''), mimetype: 'application/pdf' }, { certType: 'CPR' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects disallowed mimetype', async () => {
    const { req, res } = mockReqRes({ originalname: 'x.exe', size: 100, buffer: Buffer.from(''), mimetype: 'application/x-msdownload' }, { certType: 'CPR' });
    await createCertification(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('creates cert + upload + audit on happy path', async () => {
    prisma.employeeCertification.create.mockResolvedValue({ id: 99, certType: 'CPR', employeeId: 7, status: 'pending' });
    prisma.certificationUpload.create.mockResolvedValue({ id: 500 });

    const file = { originalname: 'cpr.pdf', size: 100, buffer: Buffer.from('hello'), mimetype: 'application/pdf' };
    const { req, res } = mockReqRes(file, { certType: 'CPR', expirationDate: '2027-01-01' });
    await createCertification(req, res);

    expect(uploadFile).toHaveBeenCalled();
    expect(prisma.employeeCertification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ employeeId: 7, certType: 'CPR', status: 'pending' }),
    }));
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      entityType: 'CertificationUpload',
      userId: 11,
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd server && npx jest --testPathPattern=requirementsController -v
```

- [ ] **Step 3: Implement** (add `createCertification` and export)

In `server/src/controllers/employeePortal/requirementsController.js`, add to imports if missing and append:

```js
const CERT_TYPES = [
  'TB Test',
  'CPR',
  'Annual Training',
  'Cultural Competency',
  'Infection Control',
  'Background Check',
  'ID',
  'Other',
];

async function createCertification(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const certType = (req.body && req.body.certType) || '';
  if (!CERT_TYPES.includes(certType)) return res.status(400).json({ error: 'Invalid certType' });

  const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
  if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
  if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });

  const expirationDate = req.body && req.body.expirationDate ? new Date(req.body.expirationDate) : null;
  const timestamp = Date.now();
  const key = `certs/${req.employee.id}/${certType}/${timestamp}-${req.file.originalname}`;
  await uploadFile(key, req.file.buffer, req.file.mimetype);

  const cert = await prisma.employeeCertification.create({
    data: { employeeId: req.employee.id, certType, status: 'pending', expirationDate, fileName: req.file.originalname, fileSize: req.file.size, fileType: req.file.mimetype },
  });

  await prisma.certificationUpload.create({
    data: {
      certificationId: cert.id,
      bucketKey: key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      note: '',
    },
  });

  audit.logAction({
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CREATE',
    entityType: 'CertificationUpload',
    entityId: cert.id,
    entityName: `${certType} - ${req.file.originalname}`,
    metadata: { employeeId: req.employee.id, fileName: req.file.originalname, certType, source: 'employee-self-upload' },
  });

  res.json({ success: true, certificationId: cert.id, status: 'pending' });
}

module.exports = { getCertifications, uploadCertification, createCertification };
```

- [ ] **Step 4: Register the route**

In `server/src/routes/employee.js`, add immediately after the line `router.post('/certifications/:certId/upload', certUpload.single('file'), uploadCertification);`:

```js
const { createCertification } = require('../controllers/employeePortal/requirementsController');
router.post('/certifications', certUpload.single('file'), createCertification);
```

(If `createCertification` is already importable from the existing destructured import at the top, just add the route line and update the import: change `const { getCertifications, uploadCertification }` to `const { getCertifications, uploadCertification, createCertification }`.)

- [ ] **Step 5: Run requirements test, expect PASS**

```bash
cd server && npx jest --testPathPattern=requirementsController -v
```

- [ ] **Step 6: Run full server suite, expect PASS**

```bash
cd server && npm test
```

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/employeePortal/requirementsController.js server/src/routes/employee.js server/src/controllers/employeePortal/__tests__/requirementsController.test.js
git commit -m "feat(server): add POST /api/employee/certifications for self-upload of missing certs"
```

---

## Task 23: API client — add `createCertification`

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/api.js`

**Interfaces:**
- Produces: `api.createCertification(formData)` — `POST /certifications` with multipart body.

- [ ] **Step 1: Add the method**

In `employee-app/src/api.js`, inside the `export const api = { ... }` object, after the `uploadCertification` line, add:

```js
  createCertification: (formData) => request('/certifications', { method: 'POST', body: formData }),
```

- [ ] **Step 2: Verify the smoke suite still passes**

```bash
cd employee-app && npm test
```

- [ ] **Step 3: Commit**

```bash
git add employee-app/src/api.js
git commit -m "feat(employee-app): add createCertification client method"
```

---

## Task 24: Assemble `HomePage`

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/pages/HomePage.jsx`

**Interfaces:**
- Consumes: `useNotifications`, `NextShiftCard`, `WeekStrip`, `SummaryChip`, `ComplianceBanner`, `ActivityFeed`, `api.getNextShift`, `api.getWeekSchedule`, `api.getActivity`.

- [ ] **Step 1: Replace the page**

Replace the full contents of `employee-app/src/pages/HomePage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../api';
import ComplianceBanner from '../components/common/ComplianceBanner';
import NextShiftCard from '../components/common/NextShiftCard';
import WeekStrip from '../components/common/WeekStrip';
import SummaryChip from '../components/common/SummaryChip';
import ActivityFeed from '../components/common/ActivityFeed';

function thisSundayISO() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default function HomePage() {
  const { user } = useAuth();
  const { complianceState, certsActionNeeded, tasksOpen, unreadMessages } = useNotifications();
  const [nextShift, setNextShift] = useState(null);
  const [weekShifts, setWeekShifts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const sunday = thisSundayISO();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.getNextShift(),
      api.getWeekSchedule(sunday),
      api.getActivity(),
    ]).then(([ns, ws, act]) => {
      if (cancelled) return;
      if (ns.status === 'fulfilled') setNextShift(ns.value);
      if (ws.status === 'fulfilled') setWeekShifts(ws.value.shifts || ws.value || []);
      if (act.status === 'fulfilled') setActivity(Array.isArray(act.value) ? act.value : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sunday]);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const totalHours = weekShifts.reduce((sum, s) => {
    const [sh, sm] = (s.startTime || '0:0').split(':').map(Number);
    const [eh, em] = (s.endTime || '0:0').split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return sum + mins / 60;
  }, 0);

  const certVariant = complianceState === 'compliant' ? 'success' : complianceState === 'attention' ? 'warning' : 'danger';
  const certLabel = complianceState === 'compliant' ? 'Certs ✓' : `${certsActionNeeded} cert${certsActionNeeded === 1 ? '' : 's'} need attention`;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hi, {firstName}</h1>
      </div>

      <ComplianceBanner />

      {loading ? <div className="skeleton skeleton--card" /> : <NextShiftCard shift={nextShift} />}

      {loading ? <div className="skeleton skeleton--card" style={{ height: 60 }} /> : <WeekStrip weekStart={sunday} shifts={weekShifts} />}

      <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: '4px 0 16px' }}>
        Week total: {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} hrs · {weekShifts.length} shift{weekShifts.length === 1 ? '' : 's'}
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <SummaryChip label="shifts this week" value={weekShifts.length} />
        <SummaryChip label="hrs scheduled" value={totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} />
        <SummaryChip label={certLabel} value="" href="/account/certs" variant={certVariant} />
        <SummaryChip label="messages" value={unreadMessages || 0} href="/messages" variant={unreadMessages > 0 ? 'warning' : 'neutral'} />
      </div>

      <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Recent Activity</h2>
      <ActivityFeed items={activity} limit={5} />
    </div>
  );
}
```

- [ ] **Step 2: Run the full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 3: Visual check**

```bash
cd employee-app && npm run dev
```

Open `http://localhost:5173/`. Confirm:
- Banner shows only if `complianceState === 'overdue'`
- WeekStrip highlights today and any shift day
- SummaryChips render with correct counts

- [ ] **Step 4: Commit**

```bash
git add employee-app/src/pages/HomePage.jsx
git commit -m "feat(employee-app): assemble new HomePage with banner, week-strip, chips, activity feed"
```

---

## Task 25: Assemble `SchedulePage` with `?date=` deep link

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/pages/SchedulePage.jsx`

- [ ] **Step 1: Update SchedulePage**

Replace `employee-app/src/pages/SchedulePage.jsx` with:

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import ScheduleWeekHeader from '../components/common/ScheduleWeekHeader';
import { hhmm12 } from '../utils/timeFormat';

function getServiceClass(code) {
  if (!code) return '';
  const c = code.toUpperCase();
  if (c.includes('PCS') || c.includes('PAS')) return 'pas';
  if (c.includes('S5130') || c.includes('S5120') || c.includes('HOMEMAKER')) return 'homemaker';
  if (c.includes('S5150') || c.includes('RESPITE')) return 'respite';
  if (c.includes('S5135') || c.includes('COMPANION')) return 'companion';
  return 'pas';
}

function getSunday(d) {
  const date = new Date(d + 'T12:00:00');
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(sunday) {
  const start = new Date(sunday + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function SchedulePage() {
  const [params] = useSearchParams();
  const initialDate = params.get('date');
  const initialSunday = initialDate ? getSunday(initialDate) : getSunday(new Date().toISOString().slice(0, 10));
  const [sunday, setSunday] = useState(initialSunday);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const dayRefs = useRef({});

  const fetchShifts = useCallback(() => {
    setLoading(true);
    api.getWeekSchedule(sunday)
      .then(data => setShifts(data.shifts || data || []))
      .finally(() => setLoading(false));
  }, [sunday]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  useEffect(() => {
    if (loading || !initialDate) return;
    const target = dayRefs.current[initialDate];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, initialDate]);

  const prevWeek = () => { const d = new Date(sunday + 'T12:00:00'); d.setDate(d.getDate() - 7); setSunday(d.toISOString().slice(0, 10)); };
  const nextWeek = () => { const d = new Date(sunday + 'T12:00:00'); d.setDate(d.getDate() + 7); setSunday(d.toISOString().slice(0, 10)); };

  const grouped = {};
  for (const s of shifts) {
    const d = (s.shiftDate || '').slice(0, 10);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  }
  const sortedDays = Object.keys(grouped).sort();

  return (
    <div>
      <div className="week-nav">
        <button className="week-nav__arrow" onClick={prevWeek} aria-label="Previous week">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span className="week-nav__label">{formatWeekLabel(sunday)}</span>
        <button className="week-nav__arrow" onClick={nextWeek} aria-label="Next week">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {loading ? (
        <div className="skeleton skeleton--card" />
      ) : (
        <ScheduleWeekHeader shifts={shifts} />
      )}

      {!loading && sortedDays.map(day => (
        <div key={day} ref={el => { dayRefs.current[day] = el; }}>
          <h3 className="day-header">
            {new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grouped[day].map(shift => (
              <div key={shift.id} className={`shift-card shift-card--${getServiceClass(shift.serviceCode)}`} onClick={() => setExpanded(expanded === shift.id ? null : shift.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="shift-card__client">{shift.client?.clientName || shift.clientName}</span>
                  <span className={`badge badge--${getServiceClass(shift.serviceCode)}`}>{shift.serviceCode}</span>
                </div>
                <p className="shift-card__time">{hhmm12(shift.startTime)} – {hhmm12(shift.endTime)}</p>
                {shift.client?.address && (
                  <a href={mapsUrl(shift.client.address)} target="_blank" rel="noopener" className="shift-card__address" onClick={e => e.stopPropagation()}>{shift.client.address}</a>
                )}
                <div className={`shift-card__details ${expanded === shift.id ? 'shift-card__details--open' : ''}`}>
                  {shift.client?.phone && <p className="shift-card__detail-row"><span className="shift-card__detail-label">Phone:</span><a href={`tel:${shift.client.phone}`}>{shift.client.phone}</a></p>}
                  {shift.client?.gateCode && <p className="shift-card__detail-row"><span className="shift-card__detail-label">Gate Code:</span>{shift.client.gateCode}</p>}
                  {shift.notes && <p className="shift-card__detail-row"><span className="shift-card__detail-label">Notes:</span>{shift.notes}</p>}
                  {shift.client?.address && (
                    <a href={mapsUrl(shift.client.address)} target="_blank" rel="noopener" className="btn btn--primary btn--sm" style={{ marginTop: 8, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>Navigate</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run the full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 3: Visual check**

In the running dev server, click a day on the Home week-strip. Confirm the Schedule page opens to the matching week and scrolls to the day.

- [ ] **Step 4: Commit**

```bash
git add employee-app/src/pages/SchedulePage.jsx
git commit -m "feat(employee-app): add ScheduleWeekHeader and deep-link support to SchedulePage"
```

---

## Task 26: Assemble `CertificationsPage` (8-slot layout + summary + upload)

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/pages/CertificationsPage.jsx`

**Interfaces:**
- Consumes: `useNotifications`, `CERT_TYPES`, `CertCard`, `CertSummary`, `api.createCertification`, `api.uploadCertification`.

- [ ] **Step 1: Replace the page**

Replace `employee-app/src/pages/CertificationsPage.jsx` with:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CERT_TYPES } from '../utils/certTypes';
import { useNotifications } from '../hooks/useNotifications';
import { api } from '../api';
import CertCard from '../components/common/CertCard';
import CertSummary from '../components/common/CertSummary';

function statusFor(cert) {
  if (!cert) return 'missing';
  if (cert.expirationDate) {
    const exp = new Date(cert.expirationDate).getTime();
    const now = Date.now();
    if (exp < now) return 'expired';
    if (exp <= now + 30 * 86400000) return 'expiring';
    return 'approved';
  }
  if (cert.status === 'active' || cert.status === 'approved') return 'approved';
  return 'pending';
}

export default function CertificationsPage() {
  const navigate = useNavigate();
  const { certsByType, certsApproved, certsPending, certsActionNeeded, certsTotal, refresh, loading } = useNotifications();
  const [error, setError] = useState('');

  async function uploadFor(certType, file) {
    setError('');
    const slotCert = certsByType.get(certType);
    const fd = new FormData();
    fd.append('file', file);
    try {
      if (slotCert && !slotCert.others) {
        await api.uploadCertification(slotCert.id, fd);
      } else {
        fd.append('certType', certType);
        await api.createCertification(fd);
      }
      await refresh();
    } catch (e) {
      setError(e.message || 'Upload failed');
    }
  }

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Certifications</h2>
      </div>

      <CertSummary approved={certsApproved} pending={certsPending} actionNeeded={certsActionNeeded} total={certsTotal} />

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? <div className="skeleton skeleton--card" style={{ height: 120 }} /> : CERT_TYPES.map(t => {
        const cert = certsByType.get(t);
        const others = cert && cert.others;
        const realCert = others ? null : cert;
        const status = statusFor(realCert);
        return (
          <div key={t} style={{ marginBottom: 12 }}>
            <CertCard slot={{ certType: t, cert: realCert, status, others }} onUpload={(file) => uploadFor(t, file)} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run the full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 3: Visual check**

Open `/account/certs`. Confirm 8 cards render in `CERT_TYPES` order. Upload a sample PDF on a missing slot; the slot should re-render as "Pending" after refresh.

- [ ] **Step 4: Commit**

```bash
git add employee-app/src/pages/CertificationsPage.jsx
git commit -m "feat(employee-app): assemble new CertificationsPage with 8-slot layout"
```

---

## Task 27: Assemble `AccountPage` with badge + count pills

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/pages/AccountPage.jsx`

- [ ] **Step 1: Replace the page**

Replace `employee-app/src/pages/AccountPage.jsx` with:

```jsx
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import NotificationCountPill from '../components/common/NotificationCountPill';
import ComplianceBadge from '../components/common/ComplianceBadge';

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { certsActionNeeded, tasksOpen } = useNotifications();

  const items = [
    { to: '/account/pay', label: 'Pay Stubs', badge: null, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
    { to: '/account/certs', label: 'Certifications', badge: certsActionNeeded, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
    { to: '/account/availability', label: 'Availability', badge: null, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
    { to: '/account/tasks', label: 'Tasks', badge: tasksOpen, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
    { to: '/account/profile', label: 'Edit Profile', badge: null, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ];

  return (
    <div>
      <div className="account-header">
        <div className="account-avatar">{getInitials(user?.name)}</div>
        <div style={{ flex: 1 }}>
          <div className="account-name">{user?.name}</div>
          <div className="account-email">{user?.email}</div>
        </div>
        <ComplianceBadge />
      </div>

      <div className="account-list">
        {items.map(item => (
          <Link key={item.to} to={item.to} className="account-row">
            <span className="account-row__icon">{item.icon}</span>
            <span className="account-row__label">{item.label}</span>
            <NotificationCountPill count={item.badge || 0} />
            <span className="account-row__chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></span>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <button className="btn--danger-text" onClick={logout}>Log Out</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 3: Commit**

```bash
git add employee-app/src/pages/AccountPage.jsx
git commit -m "feat(employee-app): assemble AccountPage with ComplianceBadge and count pills"
```

---

## Task 28: Assemble `AvailabilityPage` (toggles save + time-off inline form)

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/pages/AvailabilityPage.jsx`

**Interfaces:**
- Consumes: `api.getAvailability`, `api.submitAvailabilityRequest`, `api.getTimeOffRequests`, `api.submitTimeOff`, `AvailabilityDayRow`, `TimeOffRequestRow`.

- [ ] **Step 1: Inspect existing `availabilityController.js`**

Run:

```bash
sed -n '1,80p' server/src/controllers/employeePortal/availabilityController.js
```

Note whether `submitAvailabilityRequest` saves the schedule directly or creates a pending request. If it creates a pending request, the page will use the button label "Request schedule change"; otherwise "Save weekly schedule."

- [ ] **Step 2: Replace the page**

Replace `employee-app/src/pages/AvailabilityPage.jsx` with:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import AvailabilityDayRow from '../components/common/AvailabilityDayRow';
import TimeOffRequestRow from '../components/common/TimeOffRequestRow';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT = { on: false, in: '', out: '' };

function emptySchedule() { return Object.fromEntries(DAYS.map(d => [d, { ...DEFAULT }])); }

export default function AvailabilityPage() {
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [form, setForm] = useState(emptySchedule());
  const [timeOff, setTimeOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Save weekly schedule');
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [toStart, setToStart] = useState('');
  const [toEnd, setToEnd] = useState('');
  const [toReason, setToReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([api.getAvailability(), api.getTimeOffRequests()]).then(([a, t]) => {
      if (a.status === 'fulfilled' && a.value) {
        const raw = a.value.schedule || a.value;
        const next = emptySchedule();
        for (const d of DAYS) if (raw && raw[d]) next[d] = { on: !!raw[d].on, in: raw[d].in || '', out: raw[d].out || '' };
        setServer(next);
        setForm(next);
        if (a.value.pendingReview || a.value.status === 'pending') setSaveLabel('Request schedule change');
      } else {
        setServer(emptySchedule());
      }
      if (t.status === 'fulfilled') setTimeOff(Array.isArray(t.value) ? t.value : (t.value && t.value.requests) || []);
      setLoading(false);
    });
  }, []);

  const dirty = useMemo(() => server && JSON.stringify(server) !== JSON.stringify(form), [server, form]);

  async function save() {
    setSubmitting(true);
    setError('');
    try {
      await api.submitAvailabilityRequest({ schedule: form });
      setServer(form);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTimeOff() {
    if (!toStart || !toEnd) return;
    setError('');
    const optimistic = { id: `tmp-${Date.now()}`, startDate: toStart, endDate: toEnd, reason: toReason, status: 'pending' };
    setTimeOff([optimistic, ...timeOff]);
    try {
      const saved = await api.submitTimeOff({ startDate: toStart, endDate: toEnd, reason: toReason });
      setTimeOff(prev => [saved, ...prev.filter(r => r.id !== optimistic.id)]);
      setToStart(''); setToEnd(''); setToReason(''); setShowTimeOff(false);
    } catch (e) {
      setError(e.message || 'Time-off submit failed');
      setTimeOff(prev => prev.filter(r => r.id !== optimistic.id));
    }
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div>
      <div className="sub-header">
        <button className="sub-header__back" onClick={() => navigate('/account')} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="sub-header__title">Availability</h2>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <h3 className="day-header" style={{ marginTop: 0 }}>Weekly Availability</h3>
      {DAYS.map(d => (
        <AvailabilityDayRow key={d} day={d} value={form[d]} onChange={v => setForm(prev => ({ ...prev, [d]: v }))} />
      ))}
      <button type="button" className="btn btn--primary" disabled={!dirty || submitting} onClick={save} style={{ marginTop: 12 }}>
        {submitting ? 'Saving…' : saveLabel}
      </button>

      <h3 className="day-header">Time-Off Requests</h3>
      {timeOff.length === 0 && <div className="empty-state__text">No time-off requests</div>}
      {timeOff.map(r => <TimeOffRequestRow key={r.id} request={r} />)}

      {showTimeOff ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="form-group"><label>Start</label><input type="date" value={toStart} onChange={e => setToStart(e.target.value)} /></div>
          <div className="form-group"><label>End</label><input type="date" value={toEnd} onChange={e => setToEnd(e.target.value)} /></div>
          <div className="form-group"><label>Reason</label><input type="text" value={toReason} onChange={e => setToReason(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--outline" onClick={() => setShowTimeOff(false)}>Cancel</button>
            <button type="button" className="btn btn--primary" onClick={submitTimeOff}>Submit</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--outline btn--full" style={{ marginTop: 12 }} onClick={() => setShowTimeOff(true)}>
          + Request time off
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 4: Visual check**

Open `/account/availability`. Toggle a day on/off; "Save" is enabled only after edits. Submit a time-off request; it appears optimistically as Pending.

- [ ] **Step 5: Commit**

```bash
git add employee-app/src/pages/AvailabilityPage.jsx
git commit -m "feat(employee-app): assemble AvailabilityPage with working save and time-off form"
```

---

## Task 29: Polish `MessagesPage`

**Files:**
- Modify: `worktrees/employee-app-refinement/employee-app/src/pages/MessagesPage.jsx`

- [ ] **Step 1: Read the existing page**

Run:

```bash
sed -n '1,200p' employee-app/src/pages/MessagesPage.jsx
```

Capture the current data shape so the polish layers cleanly on top.

- [ ] **Step 2: Add four polish features**

In `MessagesPage.jsx`, make these targeted edits:

1. **Sender label above bubble when sender changes** — when rendering messages, track previous sender; if current sender is admin and previous wasn't, render `<div className="chat-sender-label">Office</div>` before the bubble.

2. **Unread divider** — on mount, capture the index of the first message where `!message.readAt && message.senderRole === 'admin'`. Before the messages map, capture that index; render `<div className="chat-unread-divider">— New messages —</div>` once before that index. Reset on next mount.

3. **Date separators** — when rendering messages, compare `createdAt` to previous; if the gap is ≥ 24 hours, render `<div className="chat-date-separator">{formatDateLabel(prev, curr)}</div>` where `formatDateLabel` returns `"Yesterday"`, `"Today"`, or the weekday + month/day (use `Intl.DateTimeFormat` for consistency).

4. **Mark-read on open** — wrap the existing `api.markRead()` call in a `useEffect(() => { ... }, [])` on mount, then call `useNotifications().refresh()` after success to clear the Home chip.

Add to `index.css`:

```css
.chat-sender-label { font-size: 11px; font-weight: 700; color: hsl(var(--muted-foreground)); margin: 8px 0 2px; }
.chat-unread-divider { text-align: center; font-size: 11px; font-weight: 700; color: hsl(var(--destructive)); margin: 12px 0; }
.chat-date-separator { text-align: center; font-size: 11px; color: hsl(var(--muted-foreground)); margin: 12px 0; }
```

- [ ] **Step 3: Auto-scroll on send and receive**

If the current page already has a ref'd messages container and an `effect` that runs when messages change, scroll the ref to the bottom. If not, add a `useRef` on the messages container and a `useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [messages])`.

- [ ] **Step 4: Run full suite, expect PASS**

```bash
cd employee-app && npm test
```

- [ ] **Step 5: Visual check**

Open `/messages`. Send a message; the view scrolls to bottom. On reload after an unread admin message, the divider is shown.

- [ ] **Step 6: Commit**

```bash
git add employee-app/src/pages/MessagesPage.jsx employee-app/src/index.css
git commit -m "feat(employee-app): polish MessagesPage (sender label, unread divider, date separators, auto-scroll)"
```

---

## Task 30: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend suite**

```bash
cd employee-app && npm test
```

Expected: every test green.

- [ ] **Step 2: Run the full backend suite**

```bash
cd server && npm test
```

Expected: every test green, including the new `homeController` and `requirementsController` files.

- [ ] **Step 3: Manual smoke checklist (iPhone viewport)**

Open Chrome, set device to iPhone 13 (390×844). Visit each page and confirm:

- [ ] HomePage shows banner only when overdue
- [ ] WeekStrip highlights today
- [ ] Tapping a WeekStrip cell opens Schedule deep-linked to that day
- [ ] Schedule shows week total + per-client breakdown
- [ ] Certifications shows 4-tile summary + 8 cards
- [ ] Missing cert upload works and slot updates to Pending after refresh
- [ ] Replace on existing cert works
- [ ] AccountPage shows compliance badge and count pills clear when underlying counts go to zero
- [ ] Availability Save disables until edits, then enables
- [ ] Time-off request appears optimistically with Pending badge
- [ ] Messages auto-scrolls on send, shows unread divider on reload after admin message
- [ ] All colors, type scale, and spacing match the admin app (open the admin client at port 5173 side-by-side for comparison)

- [ ] **Step 4: Desktop spot-check (≥768px)**

Resize the window to 1200px width. Confirm the left rail layout (already in CSS) still works and primitives don't break.

- [ ] **Step 5: No commit**

This task is verification only; no files change.

---

## Self-Review Notes

Reviewed against the spec. All sections covered:

- Goal pages — Home (Task 24), Schedule (Task 25), Requirements (Task 26), Account (Task 27), Availability (Task 28), Messages (Task 29).
- Non-Goals — none of the tasks touch nav, push notifications, sockets, read receipts, Timesheet/Pay Stubs/Onboarding.
- Design system constraint — Task 2 enforces token parity via test; Tasks 8–19 use only `hsl(var(--token))` literals; Task 20 adds CSS only inside the established system.
- TDD discipline — every primitive (Tasks 3–19) and backend addition (Tasks 21–22) follows failing test → implement.
- Architecture — file structure matches the spec; `NotificationsProvider` wraps `ProtectedRoutes` (Task 7).
- Backend additions — Task 21 widens `/home/activity`; Task 22 adds `POST /api/employee/certifications`.
- Page assemblies — Tasks 24–29 implement each page using the primitives.
- Compliance state rules — implemented in Task 6 (`useNotifications`).
- `CERT_TYPES` order — locked in Task 3.
- Audit logging — Task 22 logs as `entityType: 'CertificationUpload'`, matching the existing convention found in the current `requirementsController`. (Spec said `'Certification'`; matched existing convention for History page compatibility.)
- File constraints — Task 22 enforces 10 MB and the allowed mimetype list, mirroring the existing `uploadCertification`.
- Verification — Task 30 covers automated + manual.

Type/signature consistency: `useNotifications()` returns the keys `certsByType`, `certsActionNeeded`, `certsApproved`, `certsPending`, `certsTotal`, `tasksOpen`, `unreadMessages`, `complianceState`, `refresh`, `loading` — and these exact names are used in Tasks 24–28. `CertCard` `slot` prop has `{ certType, cert, status, others? }` — produced by `useNotifications` in Task 6 and consumed in Tasks 14 and 26.
