# Scheduling System & Modular Frontend Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the single-file React SPA into modular pages with React Router, add Employee model, enhance scheduling with weekly auth validation and SMS/email delivery with confirmation tracking.

**Architecture:** Extract ~4000-line App.jsx into separate page components, shared layout, hooks (useAuth, useToast), and utilities. Replace hash-based routing with react-router-dom v6. Add Employee model (separate from User) for caregiver contact management. Add schedule notification system with public confirmation pages.

**Tech Stack:** React 19, react-router-dom v6, Vite, Vitest + React Testing Library (frontend tests), Express, Prisma ORM, SQLite, Jest (server tests), Twilio (SMS), Nodemailer/SendGrid (email)

**Spec:** `docs/superpowers/specs/2026-03-17-scheduling-modular-rewrite-design.md`

---

## Chunk 1: Project Setup & Shared Extractions

### Task 1: Create dev branch and install dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Create dev branch**

```bash
git checkout -b dev/modular-rewrite
```

- [ ] **Step 2: Install frontend dependencies**

```bash
cd client && npm install react-router-dom
```

- [ ] **Step 3: Install frontend test dependencies**

```bash
cd client && npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 4: Add Vitest config to vite.config.js**

Modify `client/vite.config.js` — add test configuration:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    appType: 'spa',
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.js',
    },
});
```

- [ ] **Step 5: Create test setup file**

Create `client/src/test/setup.js`:

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 6: Add test script to client package.json**

Add to scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: create dev branch, install router and test deps"
```

---

### Task 2: Extract utility functions

**Files:**
- Create: `client/src/utils/dates.js`
- Create: `client/src/utils/time.js`
- Create: `client/src/utils/status.js`
- Source: `client/src/App.jsx` lines 155-187

- [ ] **Step 1: Create `client/src/utils/dates.js`**

```js
export function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`;
}

export function daysClass(days) {
    if (days < 0) return 'days-expired';
    if (days <= 15) return 'days-urgent';
    if (days <= 30) return 'days-warning';
    if (days <= 60) return 'days-soon';
    return 'days-ok';
}
```

- [ ] **Step 2: Create `client/src/utils/time.js`**

```js
export function hhmm12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
```

- [ ] **Step 3: Create `client/src/utils/status.js`**

```js
export function statusLabel(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/ && git commit -m "refactor: extract utility functions (dates, time, status)"
```

---

### Task 3: Extract Icons component

**Files:**
- Create: `client/src/components/common/Icons.jsx`
- Source: `client/src/App.jsx` lines 12-154

- [ ] **Step 1: Create `client/src/components/common/Icons.jsx`**

Copy the entire `Icons` object from App.jsx lines 12-154 into a new file. Export as default:

```js
const Icons = {
    // ... copy all 25+ SVG icon definitions from App.jsx lines 12-154
};

export default Icons;
```

Keep the exact same icon definitions — do not modify any SVG paths or viewBox attributes.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/common/Icons.jsx && git commit -m "refactor: extract Icons component"
```

---

### Task 4: Extract Toast component and useToast hook

**Files:**
- Create: `client/src/hooks/useToast.jsx`
- Create: `client/src/components/layout/Toast.jsx`
- Source: `client/src/App.jsx` lines 188-201 (Toast), App component toast state

- [ ] **Step 1: Create `client/src/hooks/useToast.jsx`**

```jsx
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
    }, []);

    const clearToast = useCallback(() => setToast(null), []);

    return (
        <ToastContext.Provider value={{ toast, showToast, clearToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
```

- [ ] **Step 2: Create `client/src/components/layout/Toast.jsx`**

```jsx
import { useEffect } from 'react';
import { useToast } from '../../hooks/useToast';

export default function Toast() {
    const { toast, clearToast } = useToast();

    useEffect(() => {
        if (toast) {
            const t = setTimeout(clearToast, 3000);
            return () => clearTimeout(t);
        }
    }, [toast, clearToast]);

    if (!toast) return null;

    return (
        <div className={`toast toast--${toast.type}`}>
            {toast.message}
        </div>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useToast.jsx client/src/components/layout/Toast.jsx && git commit -m "refactor: extract Toast component and useToast hook"
```

---

### Task 5: Extract ConfirmModal component

**Files:**
- Create: `client/src/components/common/ConfirmModal.jsx`
- Source: `client/src/App.jsx` lines 516-532

- [ ] **Step 1: Create `client/src/components/common/ConfirmModal.jsx`**

```jsx
export default function ConfirmModal({ title, message, onConfirm, onClose }) {
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p>{message}</p>
                </div>
                <div className="modal-footer">
                    <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn--danger" onClick={onConfirm}>Delete</button>
                </div>
            </div>
        </div>
    );
}
```

Verify exact markup against App.jsx lines 516-532 before writing — copy the exact JSX.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/common/ConfirmModal.jsx && git commit -m "refactor: extract ConfirmModal component"
```

---

### Task 6: Extract useAuth hook

**Files:**
- Create: `client/src/hooks/useAuth.jsx`
- Source: `client/src/App.jsx` — auth state and logic from App component (lines 3431-3500 approximately)

- [ ] **Step 1: Create `client/src/hooks/useAuth.jsx`**

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = api.getToken();
        if (!token) {
            setLoading(false);
            return;
        }
        api.getMe()
            .then(res => setUser(res.user))
            .catch(() => {
                api.clearToken();
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    // Listen for 401 logout events from api.js
    useEffect(() => {
        const handler = () => {
            setUser(null);
        };
        window.addEventListener('auth:logout', handler);
        return () => window.removeEventListener('auth:logout', handler);
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await api.login(email, password);
        api.setToken(res.token);
        setUser(res.user);
        return res.user;
    }, []);

    const logout = useCallback(() => {
        api.clearToken();
        setUser(null);
    }, []);

    const isAdmin = user?.role === 'admin';

    return (
        <AuthContext.Provider value={{ user, isAdmin, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useAuth.jsx && git commit -m "refactor: extract useAuth hook and AuthProvider"
```

---

### Task 7: Extract Sidebar and Layout components

**Files:**
- Create: `client/src/components/layout/Sidebar.jsx`
- Create: `client/src/components/layout/Layout.jsx`
- Source: `client/src/App.jsx` lines 3341-3415 (Sidebar)

- [ ] **Step 1: Create `client/src/components/layout/Sidebar.jsx`**

Copy Sidebar from App.jsx lines 3341-3415. Update to use hooks instead of props:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Icons from '../common/Icons';

export default function Sidebar() {
    const { user, isAdmin, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    const activePage = location.pathname.split('/')[1] || 'dashboard';

    const handleToggle = () => {
        setCollapsed(prev => {
            localStorage.setItem('sidebarCollapsed', String(!prev));
            return !prev;
        });
    };

    const handleNavigate = (page) => {
        navigate(`/${page}`);
    };

    // Copy the exact JSX from App.jsx lines 3341-3415
    // Replace onNavigate(page) calls with handleNavigate(page)
    // Replace activePage prop with the computed activePage above
    // Replace user/onLogout/collapsed/onToggleCollapse props with hook values
    // Keep ALL existing CSS classes and structure intact
    return (
        // ... exact sidebar JSX from App.jsx, adapted to use hooks
    );
}
```

**Critical:** Do NOT add `style={{ position: 'relative' }}` to the `<aside>` element. The sidebar uses CSS `position: fixed`.

- [ ] **Step 2: Create `client/src/components/layout/Layout.jsx`**

```jsx
import Sidebar from './Sidebar';
import Toast from './Toast';

export default function Layout({ children }) {
    return (
        <div className="app">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
            <Toast />
        </div>
    );
}
```

Note: The `app` div needs the `app--sidebar-collapsed` class toggled. Read the Sidebar's collapsed state from localStorage or lift it. Match the existing pattern from App.jsx.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout/ && git commit -m "refactor: extract Sidebar and Layout components"
```

---

## Chunk 2: Page Extractions (Simple Pages)

### Task 8: Extract LoginPage

**Files:**
- Create: `client/src/pages/LoginPage.jsx`
- Source: `client/src/App.jsx` lines 1453-1500

- [ ] **Step 1: Create `client/src/pages/LoginPage.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Icons from '../components/common/Icons';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const user = await login(email, password);
            navigate(user.role === 'admin' ? '/dashboard' : '/timesheets');
        } catch {
            // show error - use toast or local error state
        } finally {
            setLoading(false);
        }
    };

    // Copy exact JSX from App.jsx lines 1453-1500
    // Replace api.login call with the login() from useAuth
    return (
        // ... login form JSX
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/LoginPage.jsx && git commit -m "refactor: extract LoginPage"
```

---

### Task 9: Extract InsuranceTypesPage

**Files:**
- Create: `client/src/pages/InsuranceTypesPage.jsx`
- Source: `client/src/App.jsx` lines 534-667

- [ ] **Step 1: Create `client/src/pages/InsuranceTypesPage.jsx`**

Copy lines 534-667 (InsuranceTypeFormModal + InsuranceTypesPage). Adapt:
- Import `useToast` and use `showToast` instead of receiving it as a prop
- Import `api` functions directly
- Import `Icons` from components
- Keep `InsuranceTypeFormModal` as a local component in the same file (it's only used here)

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import * as api from '../api';

// InsuranceTypeFormModal - local to this page
function InsuranceTypeFormModal({ type, onSave, onClose }) {
    // ... copy from App.jsx lines 534-583
}

export default function InsuranceTypesPage() {
    const { showToast } = useToast();
    // ... copy from App.jsx lines 585-667
    // Replace showToast prop usage with hook
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/InsuranceTypesPage.jsx && git commit -m "refactor: extract InsuranceTypesPage"
```

---

### Task 10: Extract ServicesPage

**Files:**
- Create: `client/src/pages/ServicesPage.jsx`
- Source: `client/src/App.jsx` lines 668-802

- [ ] **Step 1: Create `client/src/pages/ServicesPage.jsx`**

Same pattern as InsuranceTypesPage. Copy lines 668-802, adapt imports:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function ServicesPage() {
    const { showToast } = useToast();
    // ... copy from App.jsx lines 668-802
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/ServicesPage.jsx && git commit -m "refactor: extract ServicesPage"
```

---

### Task 11: Extract UsersPage

**Files:**
- Create: `client/src/pages/UsersPage.jsx`
- Source: `client/src/App.jsx` lines 1502-1593

- [ ] **Step 1: Create `client/src/pages/UsersPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function UsersPage() {
    const { showToast } = useToast();
    // ... copy from App.jsx lines 1502-1593
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/UsersPage.jsx && git commit -m "refactor: extract UsersPage"
```

---

### Task 12: Extract SigningFormPage

**Files:**
- Create: `client/src/pages/SigningFormPage.jsx`
- Source: `client/src/App.jsx` lines 803-844 (SignaturePad) + lines 1145-1335 (SigningFormPage)

- [ ] **Step 1: Create `client/src/pages/SigningFormPage.jsx`**

This is a public page (no auth). Include SignaturePad as a local component:

```jsx
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../api';

// SignaturePad - local to this page and TimesheetFormPage
// Consider: if SignaturePad is used in multiple pages, extract to components/common/
function SignaturePad({ label, value, onChange, disabled }) {
    // ... copy from App.jsx lines 803-844
}

export default function SigningFormPage() {
    const { token } = useParams();
    // ... copy from App.jsx lines 1145-1335
    // Replace props.token with useParams() token
}
```

Note: `SignaturePad` is also used by `TimesheetFormPage`. Extract it to `client/src/components/common/SignaturePad.jsx` so both pages can import it.

- [ ] **Step 2: Create `client/src/components/common/SignaturePad.jsx`**

```jsx
import { useRef, useEffect } from 'react';

export default function SignaturePad({ label, value, onChange, disabled }) {
    // ... copy from App.jsx lines 803-844
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SigningFormPage.jsx client/src/components/common/SignaturePad.jsx && git commit -m "refactor: extract SigningFormPage and SignaturePad"
```

---

## Chunk 3: Page Extractions (Complex Pages)

### Task 13: Extract ClientsPage (from Dashboard)

**Files:**
- Create: `client/src/pages/ClientsPage.jsx`
- Source: `client/src/App.jsx` — Dashboard section (lines 3500-3690 approximately): client list, CRUD, auth management, bulk import/delete

- [ ] **Step 1: Create `client/src/pages/ClientsPage.jsx`**

This is the largest extraction. The current Dashboard contains all client management. Extract into its own page with:

- All client CRUD state: `clients`, `loading`, `expandedIds`, `searchQuery`, `statusFilter`, `selectedIds`, `modal`
- Import modals: `ClientFormModal`, `AuthFormModal`, `BulkImportModal`, `ConfirmModal`
- Include `ClientFormModal` and `AuthFormModal` and `BulkImportModal` as local components (they're only used here)
- Import `api` functions, `useToast`, `Icons`, utility functions

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import ConfirmModal from '../components/common/ConfirmModal';
import * as api from '../api';
import { fmtDate, daysClass } from '../utils/dates';
import { statusLabel } from '../utils/status';

// ClientFormModal - local
function ClientFormModal({ client, onSave, onClose, insuranceTypeNames }) {
    // ... from App.jsx lines 214-254
}

// AuthFormModal - local
function AuthFormModal({ auth, clientId, onSave, onClose }) {
    // ... from App.jsx lines 256-338
}

// BulkImportModal - local
function BulkImportModal({ onImport, onClose }) {
    // ... from App.jsx lines 340-514
}

export default function ClientsPage() {
    const { showToast } = useToast();
    // Move all client-related state and handlers from App component
    // Stats cards, filter tabs, search, client list with expandable auth rows
    // Bulk import, bulk delete, client CRUD, auth CRUD
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/ClientsPage.jsx && git commit -m "refactor: extract ClientsPage from Dashboard"
```

---

### Task 14: Create DashboardPage (overview hub)

**Files:**
- Create: `client/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Create `client/src/pages/DashboardPage.jsx`**

New overview page — not a copy of the old dashboard. Shows summary stats:

```jsx
import { useState, useEffect } from 'react';
import Icons from '../components/common/Icons';
import * as api from '../api';
import { fmtDate } from '../utils/dates';

export default function DashboardPage() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getDashboardStats()
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <div className="dashboard">
            <h2>Dashboard</h2>

            {/* Quick Stats Row */}
            <div className="dashboard-stats">
                <div className="stat-card">
                    <div className="stat-card__value">{stats?.activeClients ?? 0}</div>
                    <div className="stat-card__label">Active Clients</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__value">{stats?.activeEmployees ?? 0}</div>
                    <div className="stat-card__label">Active Employees</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__value">{stats?.todayShifts ?? 0}</div>
                    <div className="stat-card__label">Today's Shifts</div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__value">{stats?.weekHours ?? 0}</div>
                    <div className="stat-card__label">This Week's Hours</div>
                </div>
            </div>

            {/* Unconfirmed Schedules */}
            {stats?.unconfirmedCount > 0 && (
                <div className="dashboard-alert dashboard-alert--warn">
                    {stats.unconfirmedCount} employee schedule(s) awaiting confirmation
                </div>
            )}

            {/* Authorization Alerts */}
            {stats?.expiringAuths?.length > 0 && (
                <div className="dashboard-section">
                    <h3>Authorization Alerts</h3>
                    {/* List expiring/expired authorizations */}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/DashboardPage.jsx && git commit -m "feat: create DashboardPage overview hub"
```

---

### Task 15: Extract TimesheetsListPage and TimesheetFormPage

**Files:**
- Create: `client/src/pages/TimesheetsListPage.jsx`
- Create: `client/src/pages/TimesheetFormPage.jsx`
- Source: `client/src/App.jsx` lines 845-912 (helpers), 914-1143 (form), 1337-1452 (list)

- [ ] **Step 1: Create `client/src/pages/TimesheetFormPage.jsx`**

Include timesheet helpers (DAY_NAMES, roundTo15, computeHours, etc.) as local constants. Import SignaturePad from common components.

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import SignaturePad from '../components/common/SignaturePad';
import Icons from '../components/common/Icons';
import * as api from '../api';
import { hhmm12 } from '../utils/time';

// Timesheet constants and helpers
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// ... copy remaining constants from App.jsx lines 845-912

export default function TimesheetFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    // ... copy from App.jsx lines 914-1143
    // Replace timesheetId prop with useParams id
    // Replace onBack prop with navigate(-1) or navigate('/timesheets')
}
```

- [ ] **Step 2: Create `client/src/pages/TimesheetsListPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import * as api from '../api';

export default function TimesheetsListPage() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    // ... copy from App.jsx lines 1337-1452
    // Replace activeTimesheetId navigation with navigate(`/timesheets/${id}`)
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/TimesheetsListPage.jsx client/src/pages/TimesheetFormPage.jsx && git commit -m "refactor: extract Timesheet pages"
```

---

### Task 16: Extract PayrollPage

**Files:**
- Create: `client/src/pages/PayrollPage.jsx`
- Source: `client/src/App.jsx` lines 1595-2411

- [ ] **Step 1: Create `client/src/pages/PayrollPage.jsx`**

This includes PayrollUploadModal, PayrollClientGroup, PayrollEditableText, PayrollEditableUnits, PayrollEditableNotes, PayrollRunDetail, and PayrollPage. Keep them all in one file since they're tightly coupled:

```jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import ConfirmModal from '../components/common/ConfirmModal';
import * as api from '../api';
import { fmtDate } from '../utils/dates';
import { hhmm12 } from '../utils/time';

// PayrollUploadModal - local
function PayrollUploadModal({ onUpload, onClose }) {
    // ... from App.jsx lines 1595-1669
}

// PayrollEditableText - local
function PayrollEditableText({ value, displayValue, placeholder, highlight, onSave, width }) {
    // ... from App.jsx lines 1904-1971
}

// PayrollEditableUnits - local
function PayrollEditableUnits({ visit, onChange }) {
    // ... from App.jsx lines 1973-2025
}

// PayrollEditableNotes - local
function PayrollEditableNotes({ visit, onChange }) {
    // ... from App.jsx lines 2027-2074
}

// PayrollClientGroup - local
function PayrollClientGroup({ clientName, visits, onVisitChange, authMap, mergedOriginalsMap }) {
    // ... from App.jsx lines 1671-1902
}

// PayrollRunDetail - local
function PayrollRunDetail({ run, onVisitChange, authMap }) {
    // ... from App.jsx lines 2076-2199
}

export default function PayrollPage() {
    const { runId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    // ... from App.jsx lines 2201-2411
    // Replace route.runId with useParams runId
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/PayrollPage.jsx && git commit -m "refactor: extract PayrollPage with all payroll components"
```

---

### Task 17: Extract Scheduling page components

**Files:**
- Create: `client/src/pages/scheduling/ShiftFormModal.jsx`
- Create: `client/src/pages/scheduling/ScheduleCard.jsx`
- Create: `client/src/pages/scheduling/AuthSummaryBar.jsx`
- Create: `client/src/pages/scheduling/ScheduleTimeGrid.jsx`
- Create: `client/src/pages/scheduling/ScheduleOverviewTable.jsx`
- Create: `client/src/pages/scheduling/SchedulingPage.jsx`
- Source: `client/src/App.jsx` lines 2413-3339

- [ ] **Step 1: Create scheduling sub-components**

Extract each component into its own file. Each imports only what it needs:

`ShiftFormModal.jsx` — from lines 2426-2627
`ScheduleCard.jsx` — from lines 2629-2642
`AuthSummaryBar.jsx` — from lines 2644-2685
`ScheduleTimeGrid.jsx` — from lines 2702-2831
`ScheduleOverviewTable.jsx` — from lines 2833-2881

Each file follows the pattern:
```jsx
import { ... } from 'react';
import Icons from '../../components/common/Icons';
import { hhmm12 } from '../../utils/time';
// ... other imports as needed

export default function ComponentName({ ...props }) {
    // ... copy exact component logic from App.jsx
}
```

- [ ] **Step 2: Create `client/src/pages/scheduling/SchedulingPage.jsx`**

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from '../../components/common/Icons';
import ConfirmModal from '../../components/common/ConfirmModal';
import ShiftFormModal from './ShiftFormModal';
import ScheduleCard from './ScheduleCard';
import AuthSummaryBar from './AuthSummaryBar';
import ScheduleTimeGrid from './ScheduleTimeGrid';
import ScheduleOverviewTable from './ScheduleOverviewTable';
import * as api from '../../api';

export default function SchedulingPage() {
    const { showToast } = useToast();
    // ... copy from App.jsx lines 2413-3339 (the SchedulingPage function)
    // Remove clients/onRefreshClients props — fetch clients internally
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/scheduling/ && git commit -m "refactor: extract SchedulingPage and sub-components"
```

---

### Task 18: Wire up React Router in App.jsx

**Files:**
- Modify: `client/src/App.jsx` (replace entirely)
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Rewrite `client/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <App />
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
```

- [ ] **Step 2: Rewrite `client/src/App.jsx`**

Replace the entire 4000-line file with the router shell:

```jsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';
import Toast from './components/layout/Toast';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const SchedulingPage = lazy(() => import('./pages/scheduling/SchedulingPage'));
const TimesheetsListPage = lazy(() => import('./pages/TimesheetsListPage'));
const TimesheetFormPage = lazy(() => import('./pages/TimesheetFormPage'));
const SigningFormPage = lazy(() => import('./pages/SigningFormPage'));
const InsuranceTypesPage = lazy(() => import('./pages/InsuranceTypesPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const ScheduleConfirmPage = lazy(() => import('./pages/scheduling/ScheduleConfirmPage'));

function ProtectedRoute({ children, adminOnly = false }) {
    const { user, isAdmin, loading } = useAuth();
    if (loading) return <div className="page-loading">Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && !isAdmin) return <Navigate to="/timesheets" replace />;
    return children;
}

function AppRoutes() {
    const { user, loading } = useAuth();

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <Suspense fallback={<div className="page-loading">Loading...</div>}>
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/dashboard" />} />
                <Route path="/sign/:token" element={<SigningFormPage />} />
                <Route path="/schedule/confirm/:token" element={<ScheduleConfirmPage />} />

                {/* Protected routes with layout */}
                <Route path="/dashboard" element={<ProtectedRoute adminOnly><Layout><DashboardPage /></Layout></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute adminOnly><Layout><ClientsPage /></Layout></ProtectedRoute>} />
                <Route path="/employees" element={<ProtectedRoute adminOnly><Layout><EmployeesPage /></Layout></ProtectedRoute>} />
                <Route path="/scheduling" element={<ProtectedRoute adminOnly><Layout><SchedulingPage /></Layout></ProtectedRoute>} />
                <Route path="/timesheets" element={<ProtectedRoute><Layout><TimesheetsListPage /></Layout></ProtectedRoute>} />
                <Route path="/timesheets/new" element={<ProtectedRoute><Layout><TimesheetFormPage /></Layout></ProtectedRoute>} />
                <Route path="/timesheets/:id" element={<ProtectedRoute><Layout><TimesheetFormPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll" element={<ProtectedRoute adminOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/payroll/runs/:runId" element={<ProtectedRoute adminOnly><Layout><PayrollPage /></Layout></ProtectedRoute>} />
                <Route path="/insurance-types" element={<ProtectedRoute adminOnly><Layout><InsuranceTypesPage /></Layout></ProtectedRoute>} />
                <Route path="/services" element={<ProtectedRoute adminOnly><Layout><ServicesPage /></Layout></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute adminOnly><Layout><UsersPage /></Layout></ProtectedRoute>} />

                {/* Default redirect */}
                <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return <AppRoutes />;
}
```

- [ ] **Step 3: Verify the app builds**

```bash
cd client && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/main.jsx && git commit -m "refactor: replace App.jsx with React Router shell, complete modular extraction"
```

---

## Chunk 4: Backend — Employee Model & Migration

### Task 19: Add Employee model to Prisma schema

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add Employee model**

Add to schema.prisma:

```prisma
model Employee {
  id            Int                    @id @default(autoincrement())
  name          String
  phone         String                 @default("")  @map("phone")
  email         String                 @default("")  @map("email")
  active        Boolean                @default(true) @map("active")
  userId        Int?                   @unique @map("user_id")
  user          User?                  @relation(fields: [userId], references: [id], onDelete: SetNull)
  shifts        Shift[]
  notifications ScheduleNotification[]
  createdAt     DateTime               @default(now()) @map("created_at")
  updatedAt     DateTime               @updatedAt @map("updated_at")

  @@map("employees")
}

model ScheduleNotification {
  id                 Int       @id @default(autoincrement())
  employeeId         Int       @map("employee_id")
  employee           Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  weekStart          DateTime  @map("week_start")
  method             String    @map("method")
  destination        String    @map("destination")
  status             String    @default("pending") @map("status")
  confirmationToken  String    @unique @default(uuid()) @map("confirmation_token")
  confirmedAt        DateTime? @map("confirmed_at")
  sentAt             DateTime? @map("sent_at")
  failureReason      String    @default("") @map("failure_reason")
  createdAt          DateTime  @default(now()) @map("created_at")

  @@index([employeeId])
  @@index([weekStart])
  @@map("schedule_notifications")
}
```

- [ ] **Step 2: Add Employee relation to User model**

Add `employee Employee?` to the User model.

- [ ] **Step 3: Update Shift model**

Change `employeeId` from referencing User to referencing Employee. Keep it nullable for now (Phase 1 migration). Remove the old User relation on shifts. Add the Employee relation.

```prisma
model Shift {
  // ... existing fields ...
  employeeId       Int?      @map("employee_id")
  employee         Employee? @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  // Keep employeeName for now - removed in Phase 3
  employeeName     String    @default("") @map("employee_name")
  // ... rest of fields ...

  @@index([clientId])
  @@index([employeeId])
  @@index([shiftDate])
  @@map("shifts")
}
```

- [ ] **Step 4: Run migration**

```bash
cd server && npx prisma migrate dev --name add_employee_model
```

- [ ] **Step 5: Commit**

```bash
git add server/prisma/ && git commit -m "feat: add Employee and ScheduleNotification models"
```

---

### Task 20: Create Employee data migration script

**Files:**
- Create: `server/prisma/migrate-employees.js`

- [ ] **Step 1: Create migration script**

```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateEmployees() {
    console.log('Phase 1: Creating Employee records...');

    // 1. Create Employee records from PCA-role Users
    const pcaUsers = await prisma.user.findMany({ where: { role: 'pca' } });
    for (const user of pcaUsers) {
        const existing = await prisma.employee.findFirst({ where: { userId: user.id } });
        if (!existing) {
            await prisma.employee.create({
                data: {
                    name: user.name,
                    phone: user.phone || '',
                    email: user.email || '',
                    userId: user.id,
                },
            });
            console.log(`  Created Employee for User: ${user.name}`);
        }
    }

    // 2. Create Employee records from distinct employeeName values on Shifts
    const shiftsWithNames = await prisma.shift.findMany({
        where: {
            employeeName: { not: '' },
            employeeId: null,
        },
        select: { employeeName: true },
        distinct: ['employeeName'],
    });

    for (const { employeeName } of shiftsWithNames) {
        const existing = await prisma.employee.findFirst({
            where: { name: employeeName },
        });
        if (!existing) {
            await prisma.employee.create({
                data: { name: employeeName },
            });
            console.log(`  Created Employee from shift name: ${employeeName}`);
        }
    }

    // 3. Link shifts to Employee records
    console.log('\nPhase 2: Linking shifts to Employee records...');

    const allShifts = await prisma.shift.findMany({
        include: { employee: true },
    });

    let linked = 0;
    for (const shift of allShifts) {
        if (shift.employeeId) {
            // Already linked to old User FK - find Employee by userId
            const emp = await prisma.employee.findFirst({
                where: { userId: shift.employeeId },
            });
            if (emp) {
                // Will be updated when schema changes FK target
                linked++;
            }
        } else if (shift.employeeName) {
            const emp = await prisma.employee.findFirst({
                where: { name: shift.employeeName },
            });
            if (emp) {
                await prisma.shift.update({
                    where: { id: shift.id },
                    data: { employeeId: emp.id },
                });
                linked++;
            }
        }
    }

    console.log(`  Linked ${linked} shifts to Employee records`);

    const employees = await prisma.employee.findMany();
    console.log(`\nDone. Total Employee records: ${employees.length}`);
}

migrateEmployees()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add script to package.json**

Add to server/package.json scripts: `"db:migrate-employees": "node prisma/migrate-employees.js"`

- [ ] **Step 3: Run migration**

```bash
cd server && npm run db:migrate-employees
```

- [ ] **Step 4: Commit**

```bash
git add server/prisma/migrate-employees.js server/package.json && git commit -m "feat: employee data migration script"
```

---

### Task 21: Create Employee controller and routes

**Files:**
- Create: `server/src/controllers/employeeController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Create `server/src/controllers/employeeController.js`**

```js
const prisma = require('../lib/prisma');

async function listEmployees(req, res) {
    const where = {};
    if (req.query.active === 'true') where.active = true;
    if (req.query.active === 'false') where.active = false;

    const employees = await prisma.employee.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { name: 'asc' },
    });
    res.json(employees);
}

async function getEmployee(req, res) {
    const employee = await prisma.employee.findUnique({
        where: { id: Number(req.params.id) },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
}

async function createEmployee(req, res) {
    const { name, phone, email, userId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const employee = await prisma.employee.create({
        data: {
            name: name.trim(),
            phone: phone || '',
            email: email || '',
            userId: userId || null,
        },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    res.status(201).json(employee);
}

async function updateEmployee(req, res) {
    const { name, phone, email, userId, active } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (userId !== undefined) data.userId = userId;
    if (active !== undefined) data.active = active;

    const employee = await prisma.employee.update({
        where: { id: Number(req.params.id) },
        data,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    res.json(employee);
}

async function deleteEmployee(req, res) {
    await prisma.employee.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee };
```

- [ ] **Step 2: Add routes to `server/src/routes/api.js`**

Add after existing scheduling routes:

```js
const { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee } = require('../controllers/employeeController');

// Employees (Admin only)
router.get('/employees', authenticate, requireRole('admin'), listEmployees);
router.get('/employees/:id', authenticate, requireRole('admin'), getEmployee);
router.post('/employees', authenticate, requireRole('admin'), createEmployee);
router.put('/employees/:id', authenticate, requireRole('admin'), updateEmployee);
router.delete('/employees/:id', authenticate, requireRole('admin'), deleteEmployee);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/employeeController.js server/src/routes/api.js && git commit -m "feat: Employee CRUD controller and routes"
```

---

### Task 22: Update scheduling controller for Employee model

**Files:**
- Modify: `server/src/controllers/schedulingController.js`

- [ ] **Step 1: Update shift includes**

Change `shiftInclude` to reference Employee instead of User:

```js
const shiftInclude = {
    client: { select: { id: true, clientName: true, address: true, phone: true, gateCode: true } },
    employee: { select: { id: true, name: true, phone: true, email: true } },
};
```

- [ ] **Step 2: Update `checkOverlaps`**

Replace User-based employee matching with Employee-based. Remove `employeeName` fallback logic — all shifts now have `employeeId`.

- [ ] **Step 3: Update `createShift`**

Remove `employeeName` from accepted fields. `employeeId` is required (references Employee model).

- [ ] **Step 4: Update `getEmployeeSchedule`**

Query Employee instead of User:

```js
const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.employeeId) } });
```

- [ ] **Step 5: Remove `getEmployeeScheduleByName`**

Delete this function — no longer needed.

- [ ] **Step 6: Remove the route**

In `routes/api.js`, remove: `router.get('/shifts/employee-by-name', ...)`

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/schedulingController.js server/src/routes/api.js && git commit -m "refactor: update scheduling controller for Employee model"
```

---

### Task 23: Update payroll applyAuthCap for weekly units

**Files:**
- Modify: `server/src/services/payrollService.js`

- [ ] **Step 1: Write failing test**

Create `server/src/services/__tests__/payrollService.test.js`:

```js
const { applyAuthCap } = require('../payrollService');

describe('applyAuthCap - weekly grouping', () => {
    test('caps units per week independently', () => {
        const visits = [
            { clientName: 'John Smith', serviceCode: 'PCS', finalPayableUnits: 30, visitDate: new Date('2026-03-15'), voidFlag: false },
            { clientName: 'John Smith', serviceCode: 'PCS', finalPayableUnits: 30, visitDate: new Date('2026-03-22'), voidFlag: false },
        ];
        const clients = [{
            clientName: 'John Smith',
            authorizations: [{ serviceCode: 'PCS', authorizedUnits: 28 }],
        }];

        applyAuthCap(visits, clients);

        // Week 1: 30 > 28, reduced to 28
        expect(visits[0].finalPayableUnits).toBe(28);
        // Week 2: fresh 28 budget, 30 > 28, reduced to 28
        expect(visits[1].finalPayableUnits).toBe(28);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx jest --testPathPattern=payrollService
```

Expected: FAIL — current applyAuthCap treats units as total-period, so week 2 would get 0 or reduced further.

- [ ] **Step 3: Update `applyAuthCap` to group by week**

Modify `server/src/services/payrollService.js` function `applyAuthCap`:

```js
function getWeekKey(date) {
    const d = new Date(date);
    const day = d.getUTCDay();
    const sunday = new Date(d);
    sunday.setUTCDate(d.getUTCDate() - day);
    return sunday.toISOString().split('T')[0];
}

function applyAuthCap(visits, clientsWithAuths) {
    // Build auth map: normalized clientName || serviceCode → weekly authorized units
    const authMap = new Map();
    for (const client of clientsWithAuths) {
        const normClient = normalizeName(client.clientName);
        for (const auth of client.authorizations) {
            const key = `${normClient}||${auth.serviceCode}`;
            authMap.set(key, (authMap.get(key) || 0) + auth.authorizedUnits);
        }
    }

    // Group visits by week
    const weekGroups = new Map();
    for (const v of visits) {
        if (v.voidFlag || !v.serviceCode || !v.visitDate) continue;
        const weekKey = getWeekKey(v.visitDate);
        if (!weekGroups.has(weekKey)) weekGroups.set(weekKey, []);
        weekGroups.get(weekKey).push(v);
    }

    // Apply cap per week independently
    for (const [weekKey, weekVisits] of weekGroups) {
        const balanceMap = new Map(authMap); // Fresh balance each week

        for (const v of weekVisits) {
            const key = `${normalizeName(v.clientName)}||${v.serviceCode}`;

            if (!balanceMap.has(key)) {
                v.isUnauthorized = true;
                continue;
            }

            const balance = balanceMap.get(key);

            if (!isFinite(balance) || balance <= 0) {
                v.voidFlag = true;
                v.voidReason = 'No authorized units remaining (void)';
                v.isUnauthorized = true;
                v.finalPayableUnits = 0;
            } else if (v.finalPayableUnits > balance) {
                v.voidReason = `Reduced to remaining authorized units (${balance})`;
                v.finalPayableUnits = balance;
                balanceMap.set(key, 0);
            } else {
                balanceMap.set(key, balance - v.finalPayableUnits);
            }
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npx jest --testPathPattern=payrollService
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/payrollService.js server/src/services/__tests__/payrollService.test.js && git commit -m "fix: applyAuthCap groups visits by week for weekly authorization units"
```

---

## Chunk 5: Backend — Dashboard Stats, Auth Validation, Schedule Delivery

### Task 24: Add dashboard stats endpoint

**Files:**
- Create: `server/src/controllers/dashboardController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Create `server/src/controllers/dashboardController.js`**

```js
const prisma = require('../lib/prisma');
const { enrichClient } = require('../services/authorizationService');
const { getWeekRange } = require('../services/schedulingService');

async function getDashboardStats(req, res) {
    const today = new Date().toISOString().split('T')[0];
    const { weekStart, weekEnd } = getWeekRange(today);

    const [
        clientCount,
        employeeCount,
        todayShifts,
        weekShifts,
        unconfirmedNotifications,
        clients,
    ] = await Promise.all([
        prisma.client.count(),
        prisma.employee.count({ where: { active: true } }),
        prisma.shift.count({
            where: {
                shiftDate: new Date(today),
                status: { not: 'cancelled' },
            },
        }),
        prisma.shift.findMany({
            where: {
                shiftDate: { gte: new Date(weekStart), lte: new Date(weekEnd) },
                status: { not: 'cancelled' },
            },
            select: { hours: true, units: true },
        }),
        prisma.scheduleNotification.count({
            where: { status: { in: ['pending', 'sent'] }, confirmedAt: null },
        }),
        prisma.client.findMany({
            include: { authorizations: true },
        }),
    ]);

    const weekHours = weekShifts.reduce((sum, s) => sum + s.hours, 0);
    const weekUnits = weekShifts.reduce((sum, s) => sum + s.units, 0);

    // Find expiring authorizations
    const enrichedClients = clients.map(enrichClient);
    const expiringAuths = [];
    for (const client of enrichedClients) {
        for (const auth of (client.authorizations || [])) {
            if (auth.status === 'Renewal Reminder' || auth.status === 'Expired') {
                expiringAuths.push({
                    clientName: client.clientName,
                    serviceCode: auth.serviceCode,
                    status: auth.status,
                    daysToExpire: auth.daysToExpire,
                });
            }
        }
    }

    res.json({
        activeClients: clientCount,
        activeEmployees: employeeCount,
        todayShifts,
        weekHours: Math.round(weekHours * 100) / 100,
        weekUnits,
        unconfirmedCount: unconfirmedNotifications,
        expiringAuths,
    });
}

module.exports = { getDashboardStats };
```

- [ ] **Step 2: Add route**

```js
const { getDashboardStats } = require('../controllers/dashboardController');
router.get('/dashboard/stats', authenticate, requireRole('admin'), getDashboardStats);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/dashboardController.js server/src/routes/api.js && git commit -m "feat: dashboard stats API endpoint"
```

---

### Task 25: Add auth-check endpoint for scheduling validation

**Files:**
- Modify: `server/src/controllers/schedulingController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Add `authCheck` to scheduling controller**

```js
async function authCheck(req, res) {
    const { clientId, serviceCode, weekStart } = req.query;
    if (!clientId || !serviceCode || !weekStart) {
        return res.status(400).json({ error: 'clientId, serviceCode, and weekStart required' });
    }

    const { weekStart: ws, weekEnd: we } = getWeekRange(weekStart);

    const [auth, scheduledShifts] = await Promise.all([
        prisma.authorization.findFirst({
            where: {
                clientId: Number(clientId),
                serviceCode,
                authorizationStartDate: { lte: new Date(we) },
                authorizationEndDate: { gte: new Date(ws) },
            },
        }),
        prisma.shift.findMany({
            where: {
                clientId: Number(clientId),
                serviceCode,
                shiftDate: { gte: new Date(ws), lte: new Date(we) },
                status: { not: 'cancelled' },
            },
            select: { units: true },
        }),
    ]);

    const authorized = auth?.authorizedUnits || 0;
    const scheduled = scheduledShifts.reduce((sum, s) => sum + s.units, 0);

    res.json({
        authorized,
        scheduled,
        remaining: authorized - scheduled,
        serviceCode,
        weekStart: ws,
    });
}
```

- [ ] **Step 2: Add route**

```js
router.get('/shifts/auth-check', authenticate, requireRole('admin'), authCheck);
```

Place this route BEFORE `/shifts/:id` to avoid `:id` matching "auth-check".

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/schedulingController.js server/src/routes/api.js && git commit -m "feat: auth-check endpoint for scheduling validation"
```

---

### Task 26: Add schedule notification controller

**Files:**
- Create: `server/src/controllers/scheduleNotificationController.js`
- Create: `server/src/services/notificationService.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Create `server/src/services/notificationService.js`**

```js
// Notification delivery service
// Twilio and email integrations are optional — check env vars before use

function isSmsConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

function isEmailConfigured() {
    return !!(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST);
}

async function sendSms(to, body) {
    if (!isSmsConfigured()) throw new Error('SMS not configured');
    // Twilio integration — require twilio only when needed
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return client.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
    });
}

async function sendEmail(to, subject, html, text) {
    if (!isEmailConfigured()) throw new Error('Email not configured');
    // SendGrid or Nodemailer — conditional require
    if (process.env.SENDGRID_API_KEY) {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        return sgMail.send({
            to,
            from: process.env.EMAIL_FROM || 'noreply@nvbestpca.com',
            subject,
            html,
            text,
        });
    }
    // Fallback: Nodemailer SMTP
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    return transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@nvbestpca.com',
        to,
        subject,
        html,
        text,
    });
}

function formatScheduleSms(employeeName, shifts, weekLabel, confirmUrl) {
    let msg = `NV Best PCA - Schedule for ${weekLabel}:\n`;
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayAbbr[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        const startH = Number(shift.startTime.split(':')[0]) % 12 || 12;
        const startM = shift.startTime.split(':')[1];
        const startP = Number(shift.startTime.split(':')[0]) >= 12 ? 'pm' : 'am';
        const endH = Number(shift.endTime.split(':')[0]) % 12 || 12;
        const endM = shift.endTime.split(':')[1];
        const endP = Number(shift.endTime.split(':')[0]) >= 12 ? 'pm' : 'am';
        msg += `[${day} ${date}] ${startH}:${startM}${startP}-${endH}:${endM}${endP} - ${shift.client.clientName} (${shift.serviceCode})\n`;
    }
    msg += `\nConfirm: ${confirmUrl}`;
    return msg;
}

function formatScheduleEmailHtml(employeeName, shifts, weekLabel, confirmUrl) {
    let rows = '';
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const shift of shifts) {
        const d = new Date(shift.shiftDate);
        const day = dayNames[d.getUTCDay()];
        const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
        rows += `<tr>
            <td>${day} ${date}</td>
            <td>${shift.startTime} - ${shift.endTime}</td>
            <td>${shift.client.clientName}</td>
            <td>${shift.client.address || ''}</td>
            <td>${shift.client.phone || ''}</td>
            <td>${shift.client.gateCode || ''}</td>
            <td>${shift.serviceCode}</td>
        </tr>`;
    }
    return `
        <h2>Schedule for ${weekLabel}</h2>
        <p>Hi ${employeeName},</p>
        <table border="1" cellpadding="6" cellspacing="0">
            <tr><th>Day</th><th>Time</th><th>Client</th><th>Address</th><th>Phone</th><th>Gate Code</th><th>Service</th></tr>
            ${rows}
        </table>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">Confirm Receipt</a></p>
    `;
}

module.exports = {
    isSmsConfigured,
    isEmailConfigured,
    sendSms,
    sendEmail,
    formatScheduleSms,
    formatScheduleEmailHtml,
};
```

- [ ] **Step 2: Create `server/src/controllers/scheduleNotificationController.js`**

```js
const prisma = require('../lib/prisma');
const { getWeekRange } = require('../services/schedulingService');
const {
    isSmsConfigured, isEmailConfigured,
    sendSms, sendEmail,
    formatScheduleSms, formatScheduleEmailHtml,
} = require('../services/notificationService');

async function sendSchedules(req, res) {
    const { weekStart, employeeIds } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const { weekStart: ws, weekEnd: we } = getWeekRange(weekStart);
    const weekLabel = `${ws} to ${we}`;

    // Get all shifts for the week, grouped by employee
    const where = {
        shiftDate: { gte: new Date(ws), lte: new Date(we) },
        status: { not: 'cancelled' },
    };
    if (employeeIds?.length) where.employeeId = { in: employeeIds };

    const shifts = await prisma.shift.findMany({
        where,
        include: {
            client: { select: { clientName: true, address: true, phone: true, gateCode: true } },
            employee: true,
        },
        orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
    });

    // Group by employee
    const byEmployee = new Map();
    for (const shift of shifts) {
        if (!shift.employeeId) continue;
        if (!byEmployee.has(shift.employeeId)) {
            byEmployee.set(shift.employeeId, { employee: shift.employee, shifts: [] });
        }
        byEmployee.get(shift.employeeId).shifts.push(shift);
    }

    const results = [];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    for (const [empId, { employee, shifts: empShifts }] of byEmployee) {
        const hasSms = isSmsConfigured() && employee.phone;
        const hasEmail = isEmailConfigured() && employee.email;

        if (!hasSms && !hasEmail) {
            results.push({ employeeId: empId, name: employee.name, status: 'skipped', reason: 'no contact info' });
            continue;
        }

        // Create notification records and send
        if (hasSms) {
            const notification = await prisma.scheduleNotification.create({
                data: {
                    employeeId: empId,
                    weekStart: new Date(ws),
                    method: 'sms',
                    destination: employee.phone,
                },
            });
            const confirmUrl = `${baseUrl}/schedule/confirm/${notification.confirmationToken}`;
            try {
                const body = formatScheduleSms(employee.name, empShifts, weekLabel, confirmUrl);
                await sendSms(employee.phone, body);
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'sms', status: 'sent' });
            } catch (err) {
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'failed', failureReason: err.message },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'sms', status: 'failed', reason: err.message });
            }
        }

        if (hasEmail) {
            const notification = await prisma.scheduleNotification.create({
                data: {
                    employeeId: empId,
                    weekStart: new Date(ws),
                    method: 'email',
                    destination: employee.email,
                },
            });
            const confirmUrl = `${baseUrl}/schedule/confirm/${notification.confirmationToken}`;
            try {
                const html = formatScheduleEmailHtml(employee.name, empShifts, weekLabel, confirmUrl);
                const text = `Schedule for ${weekLabel}. Confirm: ${confirmUrl}`;
                await sendEmail(employee.email, `Your Schedule - ${weekLabel}`, html, text);
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'email', status: 'sent' });
            } catch (err) {
                await prisma.scheduleNotification.update({
                    where: { id: notification.id },
                    data: { status: 'failed', failureReason: err.message },
                });
                results.push({ employeeId: empId, name: employee.name, method: 'email', status: 'failed', reason: err.message });
            }
        }
    }

    res.json({ sent: results.length, results });
}

async function getNotificationStatus(req, res) {
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const { weekStart: ws } = getWeekRange(weekStart);

    const notifications = await prisma.scheduleNotification.findMany({
        where: { weekStart: new Date(ws) },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
    });

    res.json(notifications);
}

async function getScheduleConfirm(req, res) {
    const notification = await prisma.scheduleNotification.findUnique({
        where: { confirmationToken: req.params.token },
        include: { employee: true },
    });
    if (!notification) return res.status(404).json({ error: 'Invalid or expired link' });

    const { weekStart: ws, weekEnd: we } = getWeekRange(
        notification.weekStart.toISOString().split('T')[0]
    );

    const shifts = await prisma.shift.findMany({
        where: {
            employeeId: notification.employeeId,
            shiftDate: { gte: new Date(ws), lte: new Date(we) },
            status: { not: 'cancelled' },
        },
        include: {
            client: { select: { clientName: true, address: true, phone: true, gateCode: true } },
        },
        orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
    });

    res.json({
        employee: notification.employee,
        weekStart: ws,
        weekEnd: we,
        shifts,
        confirmed: !!notification.confirmedAt,
        confirmedAt: notification.confirmedAt,
    });
}

async function confirmSchedule(req, res) {
    const notification = await prisma.scheduleNotification.findUnique({
        where: { confirmationToken: req.params.token },
    });
    if (!notification) return res.status(404).json({ error: 'Invalid or expired link' });

    if (!notification.confirmedAt) {
        await prisma.scheduleNotification.update({
            where: { id: notification.id },
            data: { confirmedAt: new Date(), status: 'confirmed' },
        });
    }

    res.json({ success: true });
}

module.exports = { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule };
```

- [ ] **Step 3: Add routes**

```js
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule } = require('../controllers/scheduleNotificationController');

// Schedule Notifications (Admin)
router.post('/schedule-notifications/send', authenticate, requireRole('admin'), sendSchedules);
router.get('/schedule-notifications/status', authenticate, requireRole('admin'), getNotificationStatus);

// Schedule Confirmation (Public)
router.get('/schedule/confirm/:token', getScheduleConfirm);
router.put('/schedule/confirm/:token', confirmSchedule);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/scheduleNotificationController.js server/src/services/notificationService.js server/src/routes/api.js && git commit -m "feat: schedule notification send/confirm endpoints"
```

---

## Chunk 6: Frontend — New Pages & Enhanced Scheduling

### Task 27: Add new API functions to client api.js

**Files:**
- Modify: `client/src/api.js`

- [ ] **Step 1: Add Employee API functions**

```js
// Employees
export async function getEmployees(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request(`/employees${qs ? '?' + qs : ''}`);
}
export async function getEmployee(id) { return request(`/employees/${id}`); }
export async function createEmployee(data) { return request('/employees', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateEmployee(id, data) { return request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
export async function deleteEmployee(id) { return request(`/employees/${id}`, { method: 'DELETE' }); }
```

- [ ] **Step 2: Add notification API functions**

```js
// Schedule Notifications
export async function sendScheduleNotifications(data) { return request('/schedule-notifications/send', { method: 'POST', body: JSON.stringify(data) }); }
export async function getNotificationStatus(weekStart) { return request(`/schedule-notifications/status?weekStart=${weekStart}`); }
export async function getScheduleConfirm(token) { return request(`/schedule/confirm/${token}`, { auth: false }); }
export async function confirmSchedule(token) { return request(`/schedule/confirm/${token}`, { method: 'PUT', auth: false }); }
```

- [ ] **Step 3: Add dashboard and auth-check API functions**

```js
// Dashboard
export async function getDashboardStats() { return request('/dashboard/stats'); }

// Auth Check
export async function getAuthCheck(params) {
    const qs = new URLSearchParams(params).toString();
    return request(`/shifts/auth-check?${qs}`);
}
```

Note: The `getScheduleConfirm` and `confirmSchedule` calls are public (no auth token). Ensure the `request` helper supports an `auth: false` option, or use raw `fetch` for these like the signing form does.

- [ ] **Step 4: Commit**

```bash
git add client/src/api.js && git commit -m "feat: add Employee, notification, dashboard, auth-check API functions"
```

---

### Task 28: Create EmployeesPage

**Files:**
- Create: `client/src/pages/EmployeesPage.jsx`

- [ ] **Step 1: Create `client/src/pages/EmployeesPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import Icons from '../components/common/Icons';
import ConfirmModal from '../components/common/ConfirmModal';
import * as api from '../api';

function EmployeeFormModal({ employee, users, onSave, onClose }) {
    const [name, setName] = useState(employee?.name || '');
    const [phone, setPhone] = useState(employee?.phone || '');
    const [email, setEmail] = useState(employee?.email || '');
    const [userId, setUserId] = useState(employee?.userId || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ name, phone, email, userId: userId || null });
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{employee ? 'Edit Employee' : 'Add Employee'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label>Name *</label>
                            <input value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Link to User Account (optional)</label>
                            <select value={userId} onChange={e => setUserId(e.target.value)}>
                                <option value="">— None —</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                ))}
                            </select>
                        </div>
                        {!phone && !email && (
                            <div className="form-warning">
                                No contact info — this employee won't receive schedule notifications.
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn--primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function EmployeesPage() {
    const { showToast } = useToast();
    const [employees, setEmployees] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterActive, setFilterActive] = useState('true');
    const [modal, setModal] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [emps, usrs] = await Promise.all([
                api.getEmployees({ active: filterActive }),
                api.getUsers(),
            ]);
            setEmployees(emps);
            setUsers(usrs);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filterActive, showToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data) => {
        try {
            if (modal.employee) {
                await api.updateEmployee(modal.employee.id, data);
                showToast('Employee updated');
            } else {
                await api.createEmployee(data);
                showToast('Employee created');
            }
            setModal(null);
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDelete = async () => {
        try {
            await api.deleteEmployee(modal.employee.id);
            showToast('Employee deleted');
            setModal(null);
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleToggleActive = async (emp) => {
        try {
            await api.updateEmployee(emp.id, { active: !emp.active });
            showToast(emp.active ? 'Employee deactivated' : 'Employee activated');
            fetchData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="page-loading">Loading...</div>;

    return (
        <div className="page">
            <div className="page-header">
                <h2>Employees</h2>
                <button className="btn btn--primary" onClick={() => setModal({ type: 'form' })}>
                    + Add Employee
                </button>
            </div>

            <div className="toolbar">
                <input
                    className="search-input"
                    placeholder="Search employees..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select value={filterActive} onChange={e => { setFilterActive(e.target.value); }}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                    <option value="">All</option>
                </select>
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Linked User</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(emp => (
                        <tr key={emp.id}>
                            <td>{emp.name}</td>
                            <td>{emp.phone || '—'}{!emp.phone && <span className="text-warn" title="No phone">⚠</span>}</td>
                            <td>{emp.email || '—'}{!emp.email && <span className="text-warn" title="No email">⚠</span>}</td>
                            <td>{emp.user ? emp.user.name : '—'}</td>
                            <td><span className={`badge badge--${emp.active ? 'success' : 'muted'}`}>{emp.active ? 'Active' : 'Inactive'}</span></td>
                            <td>
                                <button className="btn btn--sm" onClick={() => setModal({ type: 'form', employee: emp })}>Edit</button>
                                <button className="btn btn--sm btn--secondary" onClick={() => handleToggleActive(emp)}>
                                    {emp.active ? 'Deactivate' : 'Activate'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {modal?.type === 'form' && (
                <EmployeeFormModal
                    employee={modal.employee}
                    users={users}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Employee"
                    message={`Delete ${modal.employee.name}? All their shifts will also be deleted.`}
                    onConfirm={handleDelete}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/EmployeesPage.jsx && git commit -m "feat: create EmployeesPage for caregiver management"
```

---

### Task 29: Create ScheduleConfirmPage (public)

**Files:**
- Create: `client/src/pages/scheduling/ScheduleConfirmPage.jsx`

- [ ] **Step 1: Create the public confirmation page**

```jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../../api';

export default function ScheduleConfirmPage() {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        api.getScheduleConfirm(token)
            .then(res => {
                setData(res);
                setConfirmed(!!res.confirmed);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            await api.confirmSchedule(token);
            setConfirmed(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setConfirming(false);
        }
    };

    if (loading) return <div className="signing-page"><p>Loading schedule...</p></div>;
    if (error) return <div className="signing-page"><p className="error">{error}</p></div>;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="signing-page">
            <div className="signing-card" style={{ maxWidth: 700 }}>
                <h2>Schedule for {data.employee.name}</h2>
                <p>Week of {data.weekStart} to {data.weekEnd}</p>

                <table className="data-table" style={{ marginTop: 16 }}>
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Time</th>
                            <th>Client</th>
                            <th>Address</th>
                            <th>Phone</th>
                            <th>Gate Code</th>
                            <th>Service</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.shifts.map(shift => {
                            const d = new Date(shift.shiftDate);
                            return (
                                <tr key={shift.id}>
                                    <td>{dayNames[d.getUTCDay()]} {d.getUTCMonth()+1}/{d.getUTCDate()}</td>
                                    <td>{shift.startTime} - {shift.endTime}</td>
                                    <td>{shift.client.clientName}</td>
                                    <td>{shift.client.address || '—'}</td>
                                    <td>{shift.client.phone || '—'}</td>
                                    <td>{shift.client.gateCode || '—'}</td>
                                    <td>{shift.serviceCode}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {confirmed ? (
                    <div className="signing-success" style={{ marginTop: 24 }}>
                        Schedule confirmed. Thank you!
                    </div>
                ) : (
                    <button
                        className="btn btn--primary"
                        style={{ marginTop: 24, width: '100%' }}
                        onClick={handleConfirm}
                        disabled={confirming}
                    >
                        {confirming ? 'Confirming...' : 'I confirm I have received this schedule'}
                    </button>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/scheduling/ScheduleConfirmPage.jsx && git commit -m "feat: create ScheduleConfirmPage for employee schedule confirmation"
```

---

### Task 30: Add ScheduleDelivery component to scheduling page

**Files:**
- Create: `client/src/pages/scheduling/ScheduleDelivery.jsx`
- Modify: `client/src/pages/scheduling/SchedulingPage.jsx`

- [ ] **Step 1: Create `client/src/pages/scheduling/ScheduleDelivery.jsx`**

```jsx
import { useState, useEffect } from 'react';
import Icons from '../../components/common/Icons';
import * as api from '../../api';

export default function ScheduleDelivery({ weekStart }) {
    const [status, setStatus] = useState([]);
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getNotificationStatus(weekStart)
            .then(setStatus)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [weekStart]);

    const handleSend = async () => {
        setSending(true);
        try {
            await api.sendScheduleNotifications({ weekStart });
            // Refresh status
            const updated = await api.getNotificationStatus(weekStart);
            setStatus(updated);
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    // Group notifications by employee
    const byEmployee = new Map();
    for (const n of status) {
        const key = n.employeeId;
        if (!byEmployee.has(key)) {
            byEmployee.set(key, { name: n.employee.name, notifications: [] });
        }
        byEmployee.get(key).notifications.push(n);
    }

    const statusIcon = (s) => {
        switch (s) {
            case 'confirmed': return '✓';
            case 'sent': return '→';
            case 'failed': return '✗';
            default: return '…';
        }
    };

    const statusColor = (s) => {
        switch (s) {
            case 'confirmed': return '#22c55e';
            case 'sent': return '#3b82f6';
            case 'failed': return '#ef4444';
            default: return '#9ca3af';
        }
    };

    return (
        <div className="sched-card" style={{ marginTop: 16 }}>
            <div className="sched-card__header">
                <div className="sched-card__header-left">
                    <div className="sched-card__header-title">Schedule Delivery</div>
                </div>
                <div className="sched-card__header-actions">
                    <button className="btn btn--primary btn--sm" onClick={handleSend} disabled={sending}>
                        {sending ? 'Sending...' : 'Send Schedules'}
                    </button>
                </div>
            </div>
            <div className="sched-card__body">
                {loading ? (
                    <p>Loading status...</p>
                ) : byEmployee.size === 0 ? (
                    <p style={{ color: '#71717a' }}>No schedules sent for this week yet.</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr><th>Employee</th><th>Method</th><th>Status</th><th>Sent</th><th>Confirmed</th></tr>
                        </thead>
                        <tbody>
                            {[...byEmployee.entries()].map(([empId, { name, notifications }]) =>
                                notifications.map((n, i) => (
                                    <tr key={n.id}>
                                        {i === 0 && <td rowSpan={notifications.length}>{name}</td>}
                                        <td>{n.method}</td>
                                        <td style={{ color: statusColor(n.status) }}>
                                            {statusIcon(n.status)} {n.status}
                                        </td>
                                        <td>{n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}</td>
                                        <td>{n.confirmedAt ? new Date(n.confirmedAt).toLocaleString() : '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Import and add to SchedulingPage**

In `SchedulingPage.jsx`, import `ScheduleDelivery` and render it below the schedule views:

```jsx
import ScheduleDelivery from './ScheduleDelivery';

// In the render, after the schedule grid/table:
<ScheduleDelivery weekStart={weekStart} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/scheduling/ScheduleDelivery.jsx client/src/pages/scheduling/SchedulingPage.jsx && git commit -m "feat: add ScheduleDelivery component with send/status tracking"
```

---

### Task 31: Enhance AuthSummaryBar with color thresholds

**Files:**
- Modify: `client/src/pages/scheduling/AuthSummaryBar.jsx`

- [ ] **Step 1: Update color logic**

Add threshold-based coloring to the existing AuthSummaryBar:

```jsx
function getUsageColor(scheduled, authorized) {
    if (authorized === 0) return '#9ca3af'; // gray for no auth
    const pct = (scheduled / authorized) * 100;
    if (pct >= 100) return '#ef4444'; // red
    if (pct >= 75) return '#f59e0b';  // yellow/amber
    return '#22c55e'; // green
}

function getUsageLabel(scheduled, authorized) {
    if (authorized === 0) return 'No authorization';
    const remaining = authorized - scheduled;
    if (remaining < 0) return `Over by ${Math.abs(remaining)} units`;
    return `${remaining} units remaining`;
}
```

Apply these in the render: set the scheduled units value color based on `getUsageColor`, and add a warning icon when `scheduled >= authorized`.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/scheduling/AuthSummaryBar.jsx && git commit -m "feat: add color thresholds to AuthSummaryBar (green/yellow/red)"
```

---

### Task 32: Add auth validation to ShiftFormModal

**Files:**
- Modify: `client/src/pages/scheduling/ShiftFormModal.jsx`

- [ ] **Step 1: Add auth check on shift create/edit**

In ShiftFormModal, when `clientId` and `serviceCode` and `shiftDate` are set, call `api.getAuthCheck()` to get remaining units:

```jsx
const [authInfo, setAuthInfo] = useState(null);

useEffect(() => {
    if (clientId && serviceCode && shiftDate) {
        api.getAuthCheck({ clientId, serviceCode, weekStart: shiftDate })
            .then(setAuthInfo)
            .catch(() => setAuthInfo(null));
    } else {
        setAuthInfo(null);
    }
}, [clientId, serviceCode, shiftDate]);
```

In the render, show the auth info near the hours/units display:

```jsx
{authInfo && (
    <div className={`sched-auth-info ${authInfo.remaining < 0 ? 'sched-auth-info--over' : authInfo.remaining < units ? 'sched-auth-info--warn' : ''}`}>
        <span>Authorized: {authInfo.authorized} units/week</span>
        <span>Scheduled: {authInfo.scheduled} units</span>
        <span>Remaining: {authInfo.remaining} units</span>
        {authInfo.remaining < units && authInfo.remaining >= 0 && (
            <div className="sched-auth-info__warning">
                This shift uses {units} units but only {authInfo.remaining} remain
            </div>
        )}
        {authInfo.remaining < 0 && (
            <div className="sched-auth-info__warning sched-auth-info__warning--over">
                Authorization already exceeded by {Math.abs(authInfo.remaining)} units
            </div>
        )}
    </div>
)}
```

Change the Save button: if `authInfo.remaining < units`, show "Save Anyway" instead of "Save".

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/scheduling/ShiftFormModal.jsx && git commit -m "feat: add real-time auth validation to ShiftFormModal"
```

---

## Chunk 7: Testing

### Task 33: Frontend component tests

**Files:**
- Create: `client/src/__tests__/useAuth.test.jsx`
- Create: `client/src/__tests__/useToast.test.jsx`
- Create: `client/src/__tests__/AuthSummaryBar.test.jsx`

- [ ] **Step 1: Test useAuth hook**

```jsx
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../hooks/useAuth';

describe('useAuth', () => {
    test('starts with null user and loading true', () => {
        const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });
        expect(result.current.user).toBeNull();
        expect(result.current.isAdmin).toBe(false);
    });
});
```

- [ ] **Step 2: Test useToast hook**

```jsx
import { renderHook, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../hooks/useToast';

describe('useToast', () => {
    test('showToast sets toast state', () => {
        const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;
        const { result } = renderHook(() => useToast(), { wrapper });

        act(() => { result.current.showToast('Test message', 'success'); });
        expect(result.current.toast).toEqual({ message: 'Test message', type: 'success' });
    });

    test('clearToast removes toast', () => {
        const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;
        const { result } = renderHook(() => useToast(), { wrapper });

        act(() => { result.current.showToast('Test', 'success'); });
        act(() => { result.current.clearToast(); });
        expect(result.current.toast).toBeNull();
    });
});
```

- [ ] **Step 3: Test AuthSummaryBar color thresholds**

```jsx
import { render, screen } from '@testing-library/react';
import AuthSummaryBar from '../pages/scheduling/AuthSummaryBar';

describe('AuthSummaryBar', () => {
    test('renders green when under 75% usage', () => {
        const summary = { PCS: { authorized: 40, scheduled: 20, remaining: 20 } };
        render(<AuthSummaryBar unitSummary={summary} />);
        expect(screen.getByText('20')).toBeInTheDocument(); // remaining
    });

    test('renders service code labels', () => {
        const summary = { PCS: { authorized: 40, scheduled: 0, remaining: 40 } };
        render(<AuthSummaryBar unitSummary={summary} />);
        expect(screen.getByText(/PCS/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 4: Run frontend tests**

```bash
cd client && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/__tests__/ && git commit -m "test: add frontend component tests (useAuth, useToast, AuthSummaryBar)"
```

---

### Task 34: Server tests for Employee CRUD

**Files:**
- Create: `server/src/controllers/__tests__/employeeController.test.js`

- [ ] **Step 1: Write Employee controller tests**

```js
// These test the controller functions directly with mocked Prisma
jest.mock('../../lib/prisma', () => ({
    employee: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}));

const prisma = require('../../lib/prisma');
const { listEmployees, createEmployee } = require('../employeeController');

function mockReqRes(overrides = {}) {
    const req = { query: {}, params: {}, body: {}, ...overrides };
    const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
    };
    return { req, res };
}

describe('listEmployees', () => {
    test('returns all employees', async () => {
        prisma.employee.findMany.mockResolvedValue([{ id: 1, name: 'Test' }]);
        const { req, res } = mockReqRes();
        await listEmployees(req, res);
        expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Test' }]);
    });

    test('filters by active status', async () => {
        prisma.employee.findMany.mockResolvedValue([]);
        const { req, res } = mockReqRes({ query: { active: 'true' } });
        await listEmployees(req, res);
        expect(prisma.employee.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { active: true } })
        );
    });
});

describe('createEmployee', () => {
    test('requires name', async () => {
        const { req, res } = mockReqRes({ body: {} });
        await createEmployee(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('creates employee with name', async () => {
        prisma.employee.create.mockResolvedValue({ id: 1, name: 'Jane' });
        const { req, res } = mockReqRes({ body: { name: 'Jane' } });
        await createEmployee(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
```

- [ ] **Step 2: Run server tests**

```bash
cd server && npm test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/__tests__/ && git commit -m "test: add Employee controller tests"
```

---

### Task 35: Server test for weekly applyAuthCap

**Files:**
- Already created in Task 23 (`server/src/services/__tests__/payrollService.test.js`)

- [ ] **Step 1: Add more test cases**

```js
test('resets balance each week — second week gets full budget', () => {
    const visits = [
        { clientName: 'A', serviceCode: 'PCS', finalPayableUnits: 20, visitDate: new Date('2026-03-15'), voidFlag: false },
        { clientName: 'A', serviceCode: 'PCS', finalPayableUnits: 10, visitDate: new Date('2026-03-16'), voidFlag: false },
        // Next week
        { clientName: 'A', serviceCode: 'PCS', finalPayableUnits: 25, visitDate: new Date('2026-03-22'), voidFlag: false },
    ];
    const clients = [{ clientName: 'A', authorizations: [{ serviceCode: 'PCS', authorizedUnits: 28 }] }];

    applyAuthCap(visits, clients);

    expect(visits[0].finalPayableUnits).toBe(20); // within budget
    expect(visits[1].finalPayableUnits).toBe(8);  // reduced (28-20=8 remaining, 10>8)
    expect(visits[2].finalPayableUnits).toBe(25); // new week, full 28 budget
});

test('marks unauthorized when no auth found', () => {
    const visits = [
        { clientName: 'Unknown', serviceCode: 'PCS', finalPayableUnits: 10, visitDate: new Date('2026-03-15'), voidFlag: false },
    ];
    applyAuthCap(visits, []);
    expect(visits[0].isUnauthorized).toBe(true);
});
```

- [ ] **Step 2: Run tests**

```bash
cd server && npx jest --testPathPattern=payrollService
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/__tests__/payrollService.test.js && git commit -m "test: add more applyAuthCap weekly grouping tests"
```

---

## Chunk 8: Final Integration & Verification

### Task 36: Update scheduling page to use Employee model

**Files:**
- Modify: `client/src/pages/scheduling/SchedulingPage.jsx`
- Modify: `client/src/pages/scheduling/ShiftFormModal.jsx`

- [ ] **Step 1: Update SchedulingPage to fetch employees from Employee endpoint**

Replace `api.getUsers()` calls with `api.getEmployees({ active: 'true' })`. Update state variable from `employees` (which was Users) to use Employee records. Remove `freeTextNames` state and the employee mode toggle (`select`/`type`) — all employees are now records.

- [ ] **Step 2: Update ShiftFormModal**

Remove `employeeMode` ('select'/'type') toggle. Remove `employeeName` free-text input. Employee dropdown now lists Employee records instead of Users. `employeeId` always references Employee model.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/scheduling/ && git commit -m "refactor: update scheduling UI to use Employee model instead of User"
```

---

### Task 37: Full build and smoke test

- [ ] **Step 1: Build frontend**

```bash
cd client && npm run build
```

Expected: Build succeeds, no errors.

- [ ] **Step 2: Run frontend tests**

```bash
cd client && npm test
```

Expected: All tests pass.

- [ ] **Step 3: Run server tests**

```bash
cd server && npm test
```

Expected: All tests pass.

- [ ] **Step 4: Run database migrations**

```bash
cd server && npx prisma migrate dev --name final_cleanup
```

- [ ] **Step 5: Start dev servers and verify**

```bash
cd server && npm run dev &
cd client && npm run dev &
```

Verify:
- Login page renders at `/login`
- Dashboard shows stats at `/dashboard`
- Clients page works at `/clients`
- Employees page works at `/employees`
- Scheduling page works at `/scheduling`
- All other pages render correctly
- Public signing page still works at `/sign/:token`

- [ ] **Step 6: Commit any fixes**

```bash
git add -A && git commit -m "fix: integration fixes from smoke testing"
```

---

### Task 38: Add CSS for new components

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add Employee page styles**

Add CSS classes for the Employees page following existing patterns (`.page`, `.page-header`, `.toolbar`, `.data-table`, `.badge`, `.form-warning`, etc.). Most should already exist.

- [ ] **Step 2: Add Dashboard overview styles**

```css
.dashboard-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}
.stat-card {
    background: hsl(0 0% 100%);
    border: 1px solid hsl(240 5.9% 90%);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
}
.stat-card__value {
    font-size: 2rem;
    font-weight: 700;
    color: hsl(240 10% 3.9%);
}
.stat-card__label {
    font-size: 0.85rem;
    color: hsl(240 3.8% 46.1%);
    margin-top: 4px;
}
.dashboard-alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
.dashboard-alert--warn { background: hsl(48 96.5% 88.8%); border: 1px solid hsl(48 96% 53%); color: hsl(32 95% 44%); }
```

- [ ] **Step 3: Add auth validation styles for ShiftFormModal**

```css
.sched-auth-info { padding: 8px 12px; border-radius: 6px; background: hsl(142 76% 96%); border: 1px solid hsl(142 71% 45%); font-size: 0.85rem; margin-top: 8px; display: flex; gap: 12px; flex-wrap: wrap; }
.sched-auth-info--warn { background: hsl(48 96% 89%); border-color: hsl(48 96% 53%); }
.sched-auth-info--over { background: hsl(0 93% 94%); border-color: hsl(0 84% 60%); }
.sched-auth-info__warning { width: 100%; color: hsl(0 84% 60%); font-weight: 500; }
.sched-auth-info__warning--over { color: hsl(0 72% 51%); }
```

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css && git commit -m "style: add CSS for dashboard, employees, auth validation"
```
