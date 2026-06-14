# Employee Portal App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first PWA for PCA employees to view schedules, upload certifications, chat with the office, manage availability/time-off, view paystubs, and track tasks — deployed as a separate Railway service sharing the existing Express API.

**Architecture:** New React+Vite PWA in `employee-app/` directory. Backend extends the existing Express server with `/api/employee/*` routes gated by a `requireEmployeeLink` middleware. Real-time chat via Socket.io attached to the same HTTP server. Railway Object Storage for cert/paystub files. Daily compliance cron evaluates certification status.

**Tech Stack:** React 19, Vite, React Router, Socket.io (client+server), vite-plugin-pwa, @aws-sdk/client-s3 (Railway Object Storage is S3-compatible), web-push, node-cron (existing), multer (existing), pdfkit (existing).

**Spec:** `docs/superpowers/specs/2026-06-14-employee-portal-design.md`

---

## Phase 1: Foundation (Backend Schema + Auth + PWA Scaffold)

### Task 1: Prisma Schema — New Models + Employee Extensions

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add `complianceStatus` and `availability` fields to Employee model**

In `server/prisma/schema.prisma`, add these fields to the `Employee` model (after the `critical` field, before the relations):

```prisma
  complianceStatus        String                 @default("ok") @map("compliance_status")
  availability            Json?                  @map("availability")
```

- [ ] **Step 2: Add CertificationUpload model**

Add after the `EmployeeCertification` model:

```prisma
model CertificationUpload {
  id              Int                   @id @default(autoincrement())
  certificationId Int                   @map("certification_id")
  bucketKey       String                @map("bucket_key")
  fileName        String                @map("file_name")
  fileSize        Int                   @map("file_size")
  fileType        String                @map("file_type")
  note            String                @default("") @map("note")
  submittedAt     DateTime              @default(now()) @map("submitted_at")
  certification   EmployeeCertification @relation(fields: [certificationId], references: [id], onDelete: Cascade)

  @@index([certificationId])
  @@map("certification_uploads")
}
```

Add the relation to `EmployeeCertification`:
```prisma
  uploads          CertificationUpload[]
```

- [ ] **Step 3: Add AvailabilityRequest model**

```prisma
model AvailabilityRequest {
  id               Int       @id @default(autoincrement())
  employeeId       Int       @map("employee_id")
  requestedChanges Json      @map("requested_changes")
  status           String    @default("pending") @map("status")
  adminNote        String    @default("") @map("admin_note")
  reviewedBy       Int?      @map("reviewed_by")
  reviewedAt       DateTime? @map("reviewed_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  employee         Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId])
  @@map("availability_requests")
}
```

Add relation to `Employee`:
```prisma
  availabilityRequests    AvailabilityRequest[]
```

- [ ] **Step 4: Add TimeOffRequest model**

```prisma
model TimeOffRequest {
  id          Int       @id @default(autoincrement())
  employeeId  Int       @map("employee_id")
  dateFrom    DateTime  @map("date_from")
  dateTo      DateTime  @map("date_to")
  reason      String
  status      String    @default("pending") @map("status")
  adminNote   String    @default("") @map("admin_note")
  reviewedBy  Int?      @map("reviewed_by")
  reviewedAt  DateTime? @map("reviewed_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  employee    Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId])
  @@map("time_off_requests")
}
```

Add relation to `Employee`:
```prisma
  timeOffRequests         TimeOffRequest[]
```

- [ ] **Step 5: Add Conversation and Message models**

```prisma
model Conversation {
  id            Int       @id @default(autoincrement())
  employeeId    Int       @unique @map("employee_id")
  lastMessageAt DateTime  @default(now()) @map("last_message_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  employee      Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  messages      Message[]

  @@map("conversations")
}

model Message {
  id             Int          @id @default(autoincrement())
  conversationId Int          @map("conversation_id")
  senderId       Int          @map("sender_id")
  senderRole     String       @map("sender_role")
  content        String
  readAt         DateTime?    @map("read_at")
  createdAt      DateTime     @default(now()) @map("created_at")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation(fields: [senderId], references: [id])

  @@index([conversationId])
  @@map("messages")
}
```

Add relation to `Employee`:
```prisma
  conversation            Conversation?
```

Add relation to `User`:
```prisma
  messages                Message[]
```

- [ ] **Step 6: Add EmployeeTask model**

```prisma
model EmployeeTask {
  id           Int       @id @default(autoincrement())
  employeeId   Int       @map("employee_id")
  title        String
  description  String    @default("")
  source       String
  linkedCertId Int?      @map("linked_cert_id")
  completedAt  DateTime? @map("completed_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  employee     Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId])
  @@map("employee_tasks")
}
```

Add relation to `Employee`:
```prisma
  employeeTasks           EmployeeTask[]
```

- [ ] **Step 7: Add Notification model**

```prisma
model Notification {
  id         Int       @id @default(autoincrement())
  employeeId Int       @map("employee_id")
  type       String
  title      String
  body       String
  readAt     DateTime? @map("read_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  employee   Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId])
  @@map("notifications")
}
```

Add relation to `Employee`:
```prisma
  portalNotifications     Notification[]
```

- [ ] **Step 8: Add PushSubscription model**

```prisma
model PushSubscription {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  endpoint  String
  p256dh    String
  auth      String
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("push_subscriptions")
}
```

Add relation to `User`:
```prisma
  pushSubscriptions       PushSubscription[]
```

- [ ] **Step 9: Run the migration**

```bash
cd server && npx prisma migrate dev --name employee_portal_models
```

Expected: Migration succeeds, new tables created.

- [ ] **Step 10: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add employee portal schema models (certUploads, availability, timeOff, chat, tasks, notifications)"
```

---

### Task 2: requireEmployeeLink Middleware + Employee Route Scaffold

**Files:**
- Create: `server/src/middleware/requireEmployeeLink.js`
- Create: `server/src/routes/employee.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Create the requireEmployeeLink middleware**

Create `server/src/middleware/requireEmployeeLink.js`:

```js
const prisma = require('../lib/prisma');

async function requireEmployeeLink(req, res, next) {
  const employee = await prisma.employee.findUnique({
    where: { userId: req.user.id },
  });
  if (!employee) {
    return res.status(403).json({ error: 'No employee profile linked to this account' });
  }
  req.employee = employee;
  next();
}

module.exports = { requireEmployeeLink };
```

- [ ] **Step 2: Create the employee router scaffold**

Create `server/src/routes/employee.js`:

```js
const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireEmployeeLink } = require('../middleware/requireEmployeeLink');

const router = express.Router();

// All employee routes require auth + employee link
router.use(authenticate);
router.use(requireEmployeeLink);

// Routes will be added per-module in subsequent tasks
// GET /api/employee/profile
// GET /api/employee/home/summary
// etc.

module.exports = router;
```

- [ ] **Step 3: Mount employee routes in the main API router**

In `server/src/routes/api.js`, add near the top (after the require statements):

```js
const employeeRoutes = require('./employee');
```

Then add before the public routes section (before `router.post('/auth/login', login);`):

```js
// ── Employee Portal routes (own auth middleware) ──
router.use('/employee', employeeRoutes);
```

- [ ] **Step 4: Verify the server starts without errors**

```bash
cd server && node -e "require('./src/app')" && echo "OK"
```

Expected: `OK` (no crash)

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/requireEmployeeLink.js server/src/routes/employee.js server/src/routes/api.js
git commit -m "feat: add requireEmployeeLink middleware and employee route scaffold"
```

---

### Task 3: Employee App PWA Scaffold (Vite + React Router + Auth)

**Files:**
- Create: `employee-app/package.json`
- Create: `employee-app/vite.config.js`
- Create: `employee-app/index.html`
- Create: `employee-app/src/main.jsx`
- Create: `employee-app/src/App.jsx`
- Create: `employee-app/src/api.js`
- Create: `employee-app/src/hooks/useAuth.js`
- Create: `employee-app/src/pages/LoginPage.jsx`
- Create: `employee-app/src/components/layout/EmployeeLayout.jsx`
- Create: `employee-app/src/components/layout/BottomTabBar.jsx`
- Create: `employee-app/src/components/layout/EmployeeSidebar.jsx`
- Create: `employee-app/src/index.css`
- Create: `employee-app/public/manifest.json`

- [ ] **Step 1: Initialize package.json**

Create `employee-app/package.json`:

```json
{
  "name": "pcalink-employee",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.13.2",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.1.0",
    "vite-plugin-pwa": "^0.21.1"
  }
}
```

- [ ] **Step 2: Create vite.config.js with PWA plugin**

Create `employee-app/vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PCAlink Employee',
        short_name: 'PCAlink',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1e293b',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/employee\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
```

- [ ] **Step 3: Create index.html**

Create `employee-app/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#1e293b" />
    <link rel="manifest" href="/manifest.json" />
    <title>PCAlink Employee</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create main.jsx entry point**

Create `employee-app/src/main.jsx`:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 5: Create the API client**

Create `employee-app/src/api.js`:

```js
const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}/api/employee${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth (uses base /api, not /api/employee)
  login: (email, password) =>
    fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => { if (!r.ok) throw new Error('Invalid credentials'); return r.json(); }),

  // Home
  getHomeSummary: () => request('/home/summary'),
  getNextShift: () => request('/home/next-shift'),
  getActivity: () => request('/home/activity'),

  // Schedule
  getWeekSchedule: (date) => request(`/schedule/week?date=${date}`),
  getScheduleHistory: () => request('/schedule/history'),

  // Availability
  getAvailability: () => request('/availability'),
  submitAvailabilityRequest: (data) => request('/availability/request', { method: 'POST', body: JSON.stringify(data) }),
  getTimeOffRequests: () => request('/time-off'),
  submitTimeOff: (data) => request('/time-off', { method: 'POST', body: JSON.stringify(data) }),

  // Requirements
  getCertifications: () => request('/certifications'),
  uploadCertification: (certId, formData) => request(`/certifications/${certId}/upload`, { method: 'POST', body: formData }),

  // Payroll
  getPayrollSummary: () => request('/payroll/summary'),
  getPaystubs: () => request('/payroll/stubs'),
  getPaystubDownload: (id) => request(`/payroll/stubs/${id}/download`),

  // Chat
  getMessages: (before) => request(`/chat/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (content) => request('/chat/messages', { method: 'POST', body: JSON.stringify({ content }) }),
  markRead: () => request('/chat/read', { method: 'PATCH' }),

  // Notifications
  getNotifications: () => request('/notifications'),
  markNotificationsRead: () => request('/notifications/read', { method: 'PATCH' }),

  // Tasks
  getTasks: () => request('/tasks'),
  completeTask: (id) => request(`/tasks/${id}/complete`, { method: 'PATCH' }),

  // Profile
  getProfile: () => request('/profile'),
  updateProfile: (data) => request('/profile', { method: 'PATCH', body: JSON.stringify(data) }),

  // Push
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: () => request('/push/subscribe', { method: 'DELETE' }),
};
```

- [ ] **Step 6: Create useAuth hook**

Create `employee-app/src/hooks/useAuth.js`:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (token && stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 7: Create LoginPage**

Create `employee-app/src/pages/LoginPage.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">PCAlink</h1>
        <p className="login-subtitle">Employee Portal</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <label className="field-label">Email</label>
          <input
            type="email"
            className="field-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <label className="field-label">Password</label>
          <input
            type="password"
            className="field-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create BottomTabBar component**

Create `employee-app/src/components/layout/BottomTabBar.jsx`:

```jsx
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/requirements', label: 'Certs', icon: 'cert' },
  { to: '/payroll', label: 'Payroll', icon: 'dollar' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
];

const ICONS = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  cert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h6"/></svg>,
  dollar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
};

export default function BottomTabBar({ badges = {} }) {
  return (
    <nav className="bottom-tab-bar">
      {TABS.map(tab => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) => `tab-item ${isActive ? 'tab-item--active' : ''}`}>
          <span className="tab-icon">
            {ICONS[tab.icon]}
            {badges[tab.icon] && <span className="tab-badge" />}
          </span>
          <span className="tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 9: Create EmployeeSidebar component**

Create `employee-app/src/components/layout/EmployeeSidebar.jsx`:

```jsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/schedule', label: 'My Schedule', icon: 'calendar' },
  { to: '/availability', label: 'Availability & Time Off', icon: 'clock' },
  { to: '/requirements', label: 'Requirements', icon: 'cert' },
  { to: '/payroll', label: 'Payroll', icon: 'dollar' },
  { to: '/chat', label: 'Communication', icon: 'chat' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/profile', label: 'My Profile', icon: 'user' },
];

export default function EmployeeSidebar({ badges = {} }) {
  const { user, logout } = useAuth();

  return (
    <aside className="employee-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">PCAlink</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
            <span className="sidebar-link-label">{item.label}</span>
            {badges[item.icon] && <span className="sidebar-badge">{badges[item.icon]}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-user">{user?.name}</span>
        <button className="sidebar-logout" onClick={logout}>Sign Out</button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 10: Create EmployeeLayout component**

Create `employee-app/src/components/layout/EmployeeLayout.jsx`:

```jsx
import { Outlet } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';
import EmployeeSidebar from './EmployeeSidebar';

export default function EmployeeLayout({ badges = {} }) {
  return (
    <div className="employee-app">
      <EmployeeSidebar badges={badges} />
      <main className="employee-main">
        <Outlet />
      </main>
      <BottomTabBar badges={badges} />
    </div>
  );
}
```

- [ ] **Step 11: Create App.jsx with routes**

Create `employee-app/src/App.jsx`:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLayout from './components/layout/EmployeeLayout';
import LoginPage from './pages/LoginPage';

function PlaceholderPage({ title }) {
  return <div className="page-placeholder"><h1>{title}</h1><p>Coming soon</p></div>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <EmployeeLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<PlaceholderPage title="Home" />} />
          <Route path="schedule" element={<PlaceholderPage title="My Schedule" />} />
          <Route path="availability" element={<PlaceholderPage title="Availability & Time Off" />} />
          <Route path="requirements" element={<PlaceholderPage title="Requirements" />} />
          <Route path="payroll" element={<PlaceholderPage title="Payroll" />} />
          <Route path="chat" element={<PlaceholderPage title="Communication" />} />
          <Route path="tasks" element={<PlaceholderPage title="Tasks" />} />
          <Route path="profile" element={<PlaceholderPage title="My Profile" />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 12: Create base CSS**

Create `employee-app/src/index.css`:

```css
:root {
  --navy: hsl(222 47% 11%);
  --slate-btn: hsl(215 20% 50%);
  --bg: hsl(0 0% 98%);
  --card-bg: #fff;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.1);
  --card-radius: 8px;
  --btn-radius: 6px;
  --modal-radius: 12px;
  --font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --text: hsl(222 47% 11%);
  --text-muted: hsl(220 9% 46%);
  --border: hsl(220 13% 91%);
  --green: hsl(142 72% 40%);
  --amber: hsl(38 92% 50%);
  --red: hsl(0 72% 50%);
  --gray-badge: hsl(240 5% 65%);
  --blue-chat: hsl(215 80% 55%);
  --sidebar-width: 240px;
  --bottom-bar-height: 56px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); font-size: 14px; color: var(--text); background: var(--bg); }

/* App layout */
.employee-app { display: flex; min-height: 100dvh; }
.employee-main { flex: 1; padding: 16px; padding-bottom: calc(var(--bottom-bar-height) + 16px); }

/* Sidebar — desktop only */
.employee-sidebar { display: none; }
@media (min-width: 768px) {
  .employee-sidebar {
    display: flex; flex-direction: column;
    width: var(--sidebar-width); background: var(--navy); color: #fff;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 20;
  }
  .employee-main { margin-left: var(--sidebar-width); padding-bottom: 16px; }
  .bottom-tab-bar { display: none; }
}

.sidebar-header { padding: 20px 16px; border-bottom: 1px solid hsl(222 30% 20%); }
.sidebar-logo { font-size: 18px; font-weight: 700; }
.sidebar-nav { flex: 1; padding: 8px 0; overflow-y: auto; }
.sidebar-link { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; color: hsl(220 20% 70%); text-decoration: none; font-size: 14px; transition: background 0.15s; }
.sidebar-link:hover { background: hsl(222 30% 18%); color: #fff; }
.sidebar-link--active { background: hsl(222 30% 18%); color: #fff; font-weight: 500; }
.sidebar-badge { background: var(--red); color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 10px; }
.sidebar-footer { padding: 12px 16px; border-top: 1px solid hsl(222 30% 20%); }
.sidebar-user { font-size: 13px; color: hsl(220 20% 70%); }
.sidebar-logout { background: none; border: none; color: hsl(220 20% 70%); cursor: pointer; font-size: 13px; margin-top: 4px; }
.sidebar-logout:hover { color: #fff; }

/* Bottom tab bar — mobile only */
.bottom-tab-bar {
  display: flex; position: fixed; bottom: 0; left: 0; right: 0;
  height: var(--bottom-bar-height); background: #fff;
  border-top: 1px solid var(--border); z-index: 20;
  padding-bottom: env(safe-area-inset-bottom);
}
.tab-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-decoration: none; color: var(--text-muted); font-size: 10px; gap: 2px; }
.tab-item--active { color: var(--navy); }
.tab-icon { width: 24px; height: 24px; position: relative; }
.tab-icon svg { width: 100%; height: 100%; }
.tab-badge { position: absolute; top: -2px; right: -4px; width: 8px; height: 8px; background: var(--red); border-radius: 50%; }
.tab-label { font-weight: 500; }

/* Login page */
.login-page { display: flex; align-items: center; justify-content: center; min-height: 100dvh; padding: 16px; background: var(--bg); }
.login-card { background: var(--card-bg); border-radius: var(--modal-radius); padding: 32px; width: 100%; max-width: 380px; box-shadow: var(--card-shadow); }
.login-title { font-size: 24px; font-weight: 700; color: var(--navy); text-align: center; }
.login-subtitle { font-size: 14px; color: var(--text-muted); text-align: center; margin-bottom: 24px; }
.login-error { background: hsl(0 72% 95%); color: var(--red); padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }

/* Form fields */
.field-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; margin-top: 12px; }
.field-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--btn-radius); font-size: 14px; outline: none; }
.field-input:focus { border-color: var(--navy); box-shadow: 0 0 0 2px hsl(222 47% 11% / 0.1); }

/* Buttons */
.btn { padding: 10px 16px; border-radius: var(--btn-radius); font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: opacity 0.15s; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--navy); color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-full { width: 100%; margin-top: 16px; }

/* Utilities */
.loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100dvh; color: var(--text-muted); }
.page-placeholder { padding: 24px; }
.page-placeholder h1 { font-size: 20px; margin-bottom: 8px; }
.page-placeholder p { color: var(--text-muted); }
```

- [ ] **Step 13: Create PWA manifest placeholder**

Create `employee-app/public/manifest.json`:

```json
{
  "name": "PCAlink Employee",
  "short_name": "PCAlink",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#1e293b",
  "background_color": "#ffffff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Create placeholder icon dirs:
```bash
mkdir -p employee-app/public/icons
```

- [ ] **Step 14: Install dependencies and verify dev server starts**

```bash
cd employee-app && npm install
```

Then verify:
```bash
cd employee-app && npx vite --port 5174 &
sleep 3 && curl -s http://localhost:5174 | head -5
kill %1
```

Expected: HTML output with `<div id="root">`.

- [ ] **Step 15: Commit**

```bash
git add employee-app/
git commit -m "feat: scaffold employee portal PWA (React + Vite + auth + responsive layout)"
```

---

## Phase 2: Core Modules (Requirements, Schedule, Profile)

### Task 4: Backend — Profile & Home Endpoints

**Files:**
- Create: `server/src/controllers/employeePortal/profileController.js`
- Create: `server/src/controllers/employeePortal/homeController.js`
- Modify: `server/src/routes/employee.js`

- [ ] **Step 1: Create profile controller**

Create `server/src/controllers/employeePortal/profileController.js`:

```js
const prisma = require('../../lib/prisma');

async function getProfile(req, res) {
  const emp = await prisma.employee.findUnique({
    where: { id: req.employee.id },
    select: {
      id: true, name: true, phone: true, email: true, address: true,
      dob: true, firstAssignmentDate: true, complianceStatus: true,
    },
  });
  res.json(emp);
}

async function updateProfile(req, res) {
  const { name, phone, email, address } = req.body;
  const updated = await prisma.employee.update({
    where: { id: req.employee.id },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(address !== undefined && { address }),
    },
    select: { id: true, name: true, phone: true, email: true, address: true },
  });
  res.json(updated);
}

module.exports = { getProfile, updateProfile };
```

- [ ] **Step 2: Create home controller**

Create `server/src/controllers/employeePortal/homeController.js`:

```js
const prisma = require('../../lib/prisma');

async function getHomeSummary(req, res) {
  const employeeId = req.employee.id;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [shiftsThisWeek, overdueCerts, openTasks] = await Promise.all([
    prisma.shift.findMany({
      where: { employeeId, shiftDate: { gte: weekStart, lt: weekEnd }, archivedAt: null },
      select: { hours: true },
    }),
    prisma.employeeCertification.count({
      where: { employeeId, expirationDate: { lt: now }, status: { not: 'expired_replaced' } },
    }),
    prisma.employeeTask.count({
      where: { employeeId, completedAt: null },
    }),
  ]);

  const hoursScheduled = shiftsThisWeek.reduce((sum, s) => sum + (s.hours || 0), 0);

  res.json({
    shiftsThisWeek: shiftsThisWeek.length,
    hoursScheduled,
    requirementsOverdue: overdueCerts,
    openTasks,
  });
}

async function getNextShift(req, res) {
  const now = new Date();
  const shift = await prisma.shift.findFirst({
    where: { employeeId: req.employee.id, shiftDate: { gte: now }, archivedAt: null },
    orderBy: { shiftDate: 'asc' },
    include: { client: { select: { clientName: true } } },
  });
  if (!shift) return res.json(null);
  res.json({
    id: shift.id,
    clientName: shift.client.clientName,
    shiftDate: shift.shiftDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    serviceCode: shift.serviceCode,
  });
}

async function getActivity(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  res.json(notifications);
}

module.exports = { getHomeSummary, getNextShift, getActivity };
```

- [ ] **Step 3: Wire routes**

Update `server/src/routes/employee.js`:

```js
const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireEmployeeLink } = require('../middleware/requireEmployeeLink');
const { getProfile, updateProfile } = require('../controllers/employeePortal/profileController');
const { getHomeSummary, getNextShift, getActivity } = require('../controllers/employeePortal/homeController');

const router = express.Router();

router.use(authenticate);
router.use(requireEmployeeLink);

// Home
router.get('/home/summary', getHomeSummary);
router.get('/home/next-shift', getNextShift);
router.get('/home/activity', getActivity);

// Profile
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

module.exports = router;
```

- [ ] **Step 4: Verify server starts**

```bash
cd server && node -e "require('./src/app')" && echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/employeePortal/ server/src/routes/employee.js
git commit -m "feat: add employee portal profile and home API endpoints"
```

---

### Task 5: Backend — Requirements (Certifications) Endpoints + Object Storage

**Files:**
- Create: `server/src/lib/storage.js`
- Create: `server/src/controllers/employeePortal/requirementsController.js`
- Modify: `server/src/routes/employee.js`

- [ ] **Step 1: Install S3 SDK**

```bash
cd server && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Create storage utility**

Create `server/src/lib/storage.js`:

```js
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY || '',
    secretAccessKey: process.env.RAILWAY_OBJECT_STORAGE_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.RAILWAY_BUCKET_NAME || 'nvbestpca-files';

async function uploadFile(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

async function getPresignedUrl(key, expiresIn = 300) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

module.exports = { uploadFile, getPresignedUrl };
```

- [ ] **Step 3: Create requirements controller**

Create `server/src/controllers/employeePortal/requirementsController.js`:

```js
const prisma = require('../../lib/prisma');
const { uploadFile } = require('../../lib/storage');

const CERT_TYPES = [
  'id_expiration', 'tb_test', 'cpr', 'annual_training',
  'cultural_competency', 'infection_control', 'background_check', 'other',
];

async function getCertifications(req, res) {
  const certs = await prisma.employeeCertification.findMany({
    where: { employeeId: req.employee.id },
    select: {
      id: true, certType: true, expirationDate: true, status: true, notes: true, updatedAt: true,
    },
    orderBy: { certType: 'asc' },
  });

  const counts = { approved: 0, pending: 0, actionNeeded: 0, total: certs.length };
  for (const c of certs) {
    if (c.status === 'approved' || c.status === 'active') counts.approved++;
    else if (c.status === 'pending') counts.pending++;
    else counts.actionNeeded++;
  }

  res.json({ certifications: certs, summary: counts });
}

async function uploadCertification(req, res) {
  const certId = parseInt(req.params.certId);
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const cert = await prisma.employeeCertification.findFirst({
    where: { id: certId, employeeId: req.employee.id },
  });
  if (!cert) return res.status(404).json({ error: 'Certification not found' });

  const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
  if (!allowed.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
  }
  if (req.file.size > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });
  }

  const timestamp = Date.now();
  const key = `certs/${req.employee.id}/${cert.certType}/${timestamp}-${req.file.originalname}`;
  await uploadFile(key, req.file.buffer, req.file.mimetype);

  const note = req.body.note || '';
  await prisma.$transaction([
    prisma.certificationUpload.create({
      data: {
        certificationId: certId,
        bucketKey: key,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        note,
      },
    }),
    prisma.employeeCertification.update({
      where: { id: certId },
      data: { status: 'pending' },
    }),
  ]);

  res.json({ success: true, status: 'pending' });
}

module.exports = { getCertifications, uploadCertification };
```

- [ ] **Step 4: Add routes with multer**

Update `server/src/routes/employee.js` — add at the top:

```js
const multer = require('multer');
const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const { getCertifications, uploadCertification } = require('../controllers/employeePortal/requirementsController');
```

Add routes:

```js
// Requirements
router.get('/certifications', getCertifications);
router.post('/certifications/:certId/upload', certUpload.single('file'), uploadCertification);
```

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/storage.js server/src/controllers/employeePortal/requirementsController.js server/src/routes/employee.js server/package.json server/package-lock.json
git commit -m "feat: add certifications endpoint with Railway Object Storage uploads"
```

---

### Task 6: Backend — Schedule Endpoints

**Files:**
- Create: `server/src/controllers/employeePortal/scheduleController.js`
- Modify: `server/src/routes/employee.js`

- [ ] **Step 1: Create schedule controller**

Create `server/src/controllers/employeePortal/scheduleController.js`:

```js
const prisma = require('../../lib/prisma');

async function getWeekSchedule(req, res) {
  const dateParam = req.query.date;
  let weekStart;
  if (dateParam) {
    weekStart = new Date(dateParam + 'T00:00:00');
  } else {
    weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: req.employee.id,
      shiftDate: { gte: weekStart, lt: weekEnd },
      archivedAt: null,
    },
    include: { client: { select: { clientName: true, address: true, phone: true, gateCode: true } } },
    orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
  });

  res.json({ weekStart: weekStart.toISOString(), shifts });
}

async function getScheduleHistory(req, res) {
  const notifications = await prisma.scheduleNotification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, weekStart: true, status: true, sentAt: true, confirmedAt: true, method: true,
    },
  });
  res.json(notifications);
}

module.exports = { getWeekSchedule, getScheduleHistory };
```

- [ ] **Step 2: Add routes**

In `server/src/routes/employee.js`, add import:

```js
const { getWeekSchedule, getScheduleHistory } = require('../controllers/employeePortal/scheduleController');
```

Add routes:

```js
// Schedule
router.get('/schedule/week', getWeekSchedule);
router.get('/schedule/history', getScheduleHistory);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/employeePortal/scheduleController.js server/src/routes/employee.js
git commit -m "feat: add employee schedule endpoints (week view + history)"
```

---

### Task 7: Backend — Availability & Time Off Endpoints

**Files:**
- Create: `server/src/controllers/employeePortal/availabilityController.js`
- Modify: `server/src/routes/employee.js`

- [ ] **Step 1: Create availability controller**

Create `server/src/controllers/employeePortal/availabilityController.js`:

```js
const prisma = require('../../lib/prisma');

async function getAvailability(req, res) {
  const emp = await prisma.employee.findUnique({
    where: { id: req.employee.id },
    select: { availability: true },
  });
  res.json({ availability: emp.availability });
}

async function submitAvailabilityRequest(req, res) {
  const { requestedChanges } = req.body;
  if (!requestedChanges) return res.status(400).json({ error: 'requestedChanges is required' });

  const request = await prisma.availabilityRequest.create({
    data: { employeeId: req.employee.id, requestedChanges },
  });
  res.status(201).json(request);
}

async function getTimeOffRequests(req, res) {
  const requests = await prisma.timeOffRequest.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
}

async function submitTimeOff(req, res) {
  const { dateFrom, dateTo, reason } = req.body;
  if (!dateFrom || !dateTo || !reason) {
    return res.status(400).json({ error: 'dateFrom, dateTo, and reason are required' });
  }
  const validReasons = ['vacation', 'sick_leave', 'personal', 'medical'];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason' });
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      employeeId: req.employee.id,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      reason,
    },
  });
  res.status(201).json(request);
}

module.exports = { getAvailability, submitAvailabilityRequest, getTimeOffRequests, submitTimeOff };
```

- [ ] **Step 2: Add routes**

In `server/src/routes/employee.js`, add import:

```js
const { getAvailability, submitAvailabilityRequest, getTimeOffRequests, submitTimeOff } = require('../controllers/employeePortal/availabilityController');
```

Add routes:

```js
// Availability & Time Off
router.get('/availability', getAvailability);
router.post('/availability/request', submitAvailabilityRequest);
router.get('/time-off', getTimeOffRequests);
router.post('/time-off', submitTimeOff);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/employeePortal/availabilityController.js server/src/routes/employee.js
git commit -m "feat: add availability and time-off request endpoints"
```

---

### Task 8: Backend — Payroll & Tasks Endpoints

**Files:**
- Create: `server/src/controllers/employeePortal/payrollController.js`
- Create: `server/src/controllers/employeePortal/tasksController.js`
- Modify: `server/src/routes/employee.js`

- [ ] **Step 1: Create payroll controller**

Create `server/src/controllers/employeePortal/payrollController.js`:

```js
const prisma = require('../../lib/prisma');
const { getPresignedUrl } = require('../../lib/storage');

async function getPayrollSummary(req, res) {
  const employeeId = req.employee.id;
  const lastReceipt = await prisma.payReceipt.findFirst({
    where: { employeeId },
    orderBy: { payDate: 'desc' },
    select: { netPay: true, payDate: true, totalHours: true, periodStart: true, periodEnd: true },
  });

  const ytd = await prisma.payReceipt.findFirst({
    where: { employeeId },
    orderBy: { payDate: 'desc' },
    select: { ytdGross: true, ytdNet: true },
  });

  res.json({
    lastPaycheck: lastReceipt ? { amount: lastReceipt.netPay, date: lastReceipt.payDate } : null,
    ytdEarnings: ytd ? ytd.ytdGross : 0,
    currentPeriodHours: lastReceipt ? lastReceipt.totalHours : 0,
  });
}

async function getPaystubs(req, res) {
  const receipts = await prisma.payReceipt.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { payDate: 'desc' },
    select: {
      id: true, periodStart: true, periodEnd: true, payDate: true,
      grossEarnings: true, netPay: true, totalHours: true, status: true,
    },
  });
  res.json(receipts);
}

async function downloadPaystub(req, res) {
  const id = parseInt(req.params.id);
  const receipt = await prisma.payReceipt.findFirst({
    where: { id, employeeId: req.employee.id },
  });
  if (!receipt) return res.status(404).json({ error: 'Paystub not found' });

  // For now, return receipt data directly. When bucket storage is active,
  // generate presigned URL from bucketKey.
  res.json({ receipt });
}

module.exports = { getPayrollSummary, getPaystubs, downloadPaystub };
```

- [ ] **Step 2: Create tasks controller**

Create `server/src/controllers/employeePortal/tasksController.js`:

```js
const prisma = require('../../lib/prisma');

async function getTasks(req, res) {
  const tasks = await prisma.employeeTask.findMany({
    where: { employeeId: req.employee.id },
    orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(tasks);
}

async function completeTask(req, res) {
  const id = parseInt(req.params.id);
  const task = await prisma.employeeTask.findFirst({
    where: { id, employeeId: req.employee.id },
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.source === 'compliance') {
    return res.status(400).json({ error: 'Compliance tasks auto-resolve when certification is approved' });
  }

  const updated = await prisma.employeeTask.update({
    where: { id },
    data: { completedAt: new Date() },
  });
  res.json(updated);
}

module.exports = { getTasks, completeTask };
```

- [ ] **Step 3: Add routes**

In `server/src/routes/employee.js`, add imports:

```js
const { getPayrollSummary, getPaystubs, downloadPaystub } = require('../controllers/employeePortal/payrollController');
const { getTasks, completeTask } = require('../controllers/employeePortal/tasksController');
```

Add routes:

```js
// Payroll
router.get('/payroll/summary', getPayrollSummary);
router.get('/payroll/stubs', getPaystubs);
router.get('/payroll/stubs/:id/download', downloadPaystub);

// Tasks
router.get('/tasks', getTasks);
router.patch('/tasks/:id/complete', completeTask);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/employeePortal/payrollController.js server/src/controllers/employeePortal/tasksController.js server/src/routes/employee.js
git commit -m "feat: add employee payroll and tasks endpoints"
```

---

## Phase 3: Real-Time Chat + Notifications

### Task 9: Socket.io Server Setup

**Files:**
- Create: `server/src/socket.js`
- Modify: `server/src/index.js`
- Modify: `server/package.json`

- [ ] **Step 1: Install Socket.io**

```bash
cd server && npm install socket.io
```

- [ ] **Step 2: Create socket.js module**

Create `server/src/socket.js`:

```js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'nvbestpca-secret';
let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.EMPLOYEE_APP_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = payload;
      if (payload.role === 'pca') {
        const employee = await prisma.employee.findUnique({ where: { userId: payload.id } });
        if (employee) socket.employeeId = employee.id;
      }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.employeeId) {
      socket.join(`employee:${socket.employeeId}`);
    }
    if (socket.user.role === 'admin' || socket.user.role === 'user') {
      socket.join('office');
    }

    socket.on('chat:message', async (data) => {
      if (!socket.employeeId) return;
      try {
        const convo = await prisma.conversation.upsert({
          where: { employeeId: socket.employeeId },
          create: { employeeId: socket.employeeId },
          update: { lastMessageAt: new Date() },
        });
        const msg = await prisma.message.create({
          data: {
            conversationId: convo.id,
            senderId: socket.user.id,
            senderRole: socket.user.role,
            content: data.content,
          },
        });
        const payload = { id: msg.id, content: msg.content, senderId: msg.senderId, senderRole: msg.senderRole, createdAt: msg.createdAt };
        socket.emit('chat:message', payload);
        io.to('office').emit('chat:message', { ...payload, employeeId: socket.employeeId, employeeName: socket.user.name });
      } catch (err) {
        socket.emit('chat:error', { error: 'Failed to send message' });
      }
    });

    socket.on('chat:typing', () => {
      if (socket.employeeId) {
        io.to('office').emit('chat:typing', { employeeId: socket.employeeId });
      }
    });

    socket.on('chat:read', async (data) => {
      if (!socket.employeeId || !data.upTo) return;
      await prisma.message.updateMany({
        where: { id: { lte: data.upTo }, conversation: { employeeId: socket.employeeId }, readAt: null },
        data: { readAt: new Date() },
      });
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  return io;
}

function emitToEmployee(employeeId, event, data) {
  if (io) io.to(`employee:${employeeId}`).emit(event, data);
}

function emitToOffice(event, data) {
  if (io) io.to('office').emit(event, data);
}

module.exports = { initSocket, getIO, emitToEmployee, emitToOffice };
```

- [ ] **Step 3: Integrate socket into server startup**

Modify `server/src/index.js` — change `app.listen` to use `http.createServer`:

```js
require('dotenv').config();
const http = require('http');
const app = require('./app');
const cron = require('node-cron');
const { initSocket } = require('./socket');
const { sendOverdueReminders } = require('./jobs/timesheetReminders');
const { runTaskTriggers } = require('./jobs/taskTriggers');
const { sendTaskReminders } = require('./jobs/taskReminders');

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => {
    console.log(`Auth Tracking API running on http://localhost:${PORT}`);

    cron.schedule('0 6 * * 0', async () => {
        console.log('[Cron] Running overdue timesheet reminders...');
        try {
            await sendOverdueReminders();
        } catch (err) {
            console.error('[Cron] Reminder job failed:', err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: overdue timesheet reminders (Sunday 6:00 AM UTC)');

    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Running task triggers...');
        try {
            await runTaskTriggers();
        } catch (err) {
            console.error('[Cron] Task triggers job failed:', err);
        }
    }, { timezone: 'UTC' });

    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running task reminders...');
        try {
            await sendTaskReminders();
        } catch (err) {
            console.error('[Cron] Task reminders job failed:', err);
        }
    }, { timezone: 'UTC' });

    console.log('[Cron] Scheduled: task triggers (hourly)');
    console.log('[Cron] Scheduled: task reminders (daily 8:00 AM UTC)');
});
```

- [ ] **Step 4: Verify server starts with socket**

```bash
cd server && node -e "const http=require('http'); const app=require('./src/app'); const {initSocket}=require('./src/socket'); const s=http.createServer(app); initSocket(s); s.listen(0, ()=>{console.log('OK'); s.close();})"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/socket.js server/src/index.js server/package.json server/package-lock.json
git commit -m "feat: add Socket.io server for real-time chat and notifications"
```

---

### Task 10: Backend — Chat REST Endpoints + Notifications

**Files:**
- Create: `server/src/controllers/employeePortal/chatController.js`
- Create: `server/src/controllers/employeePortal/notificationController.js`
- Modify: `server/src/routes/employee.js`

- [ ] **Step 1: Create chat controller**

Create `server/src/controllers/employeePortal/chatController.js`:

```js
const prisma = require('../../lib/prisma');

async function getMessages(req, res) {
  const employeeId = req.employee.id;
  const before = req.query.before ? parseInt(req.query.before) : undefined;

  let convo = await prisma.conversation.findUnique({ where: { employeeId } });
  if (!convo) {
    convo = await prisma.conversation.create({ data: { employeeId } });
  }

  const where = { conversationId: convo.id };
  if (before) where.id = { lt: before };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { sender: { select: { name: true } } },
  });

  res.json({ conversationId: convo.id, messages: messages.reverse() });
}

async function sendMessage(req, res) {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });

  const employeeId = req.employee.id;
  let convo = await prisma.conversation.findUnique({ where: { employeeId } });
  if (!convo) {
    convo = await prisma.conversation.create({ data: { employeeId } });
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: convo.id,
      senderId: req.user.id,
      senderRole: req.user.role,
      content: content.trim(),
    },
    include: { sender: { select: { name: true } } },
  });

  await prisma.conversation.update({
    where: { id: convo.id },
    data: { lastMessageAt: new Date() },
  });

  res.status(201).json(msg);
}

async function markRead(req, res) {
  const employeeId = req.employee.id;
  const convo = await prisma.conversation.findUnique({ where: { employeeId } });
  if (!convo) return res.json({ updated: 0 });

  const result = await prisma.message.updateMany({
    where: { conversationId: convo.id, senderRole: { not: 'pca' }, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}

module.exports = { getMessages, sendMessage, markRead };
```

- [ ] **Step 2: Create notification controller**

Create `server/src/controllers/employeePortal/notificationController.js`:

```js
const prisma = require('../../lib/prisma');

async function getNotifications(req, res) {
  const notifications = await prisma.notification.findMany({
    where: { employeeId: req.employee.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
}

async function markNotificationsRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { employeeId: req.employee.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
}

module.exports = { getNotifications, markNotificationsRead };
```

- [ ] **Step 3: Add routes**

In `server/src/routes/employee.js`, add imports:

```js
const { getMessages, sendMessage, markRead } = require('../controllers/employeePortal/chatController');
const { getNotifications, markNotificationsRead } = require('../controllers/employeePortal/notificationController');
```

Add routes:

```js
// Chat
router.get('/chat/messages', getMessages);
router.post('/chat/messages', sendMessage);
router.patch('/chat/read', markRead);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/read', markNotificationsRead);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/employeePortal/chatController.js server/src/controllers/employeePortal/notificationController.js server/src/routes/employee.js
git commit -m "feat: add chat and notification REST endpoints for employee portal"
```

---

### Task 11: Compliance Cron Job

**Files:**
- Create: `server/src/services/complianceService.js`
- Create: `server/src/jobs/complianceCron.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Create compliance service**

Create `server/src/services/complianceService.js`:

```js
const prisma = require('../lib/prisma');
const { emitToEmployee } = require('../socket');

const RENEWAL_YEARS = {
  tb_test: 1,
  cpr: 2,
  annual_training: 1,
  cultural_competency: 2,
  infection_control: 1,
  background_check: 5,
};

async function evaluateCompliance(employeeId) {
  const now = new Date();
  const certs = await prisma.employeeCertification.findMany({
    where: { employeeId },
  });

  const hasExpired = certs.some(c =>
    c.expirationDate && c.expirationDate < now && c.status !== 'pending'
  );

  const newStatus = hasExpired ? 'blocked' : 'ok';
  await prisma.employee.update({
    where: { id: employeeId },
    data: { complianceStatus: newStatus },
  });

  return newStatus;
}

async function createComplianceTask(employeeId, certType, certId) {
  const existing = await prisma.employeeTask.findFirst({
    where: { employeeId, linkedCertId: certId, completedAt: null },
  });
  if (existing) return existing;

  const title = `Renew ${certType.replace(/_/g, ' ')}`;
  return prisma.employeeTask.create({
    data: { employeeId, title, source: 'compliance', linkedCertId: certId },
  });
}

async function createNotification(employeeId, type, title, body) {
  const notif = await prisma.notification.create({
    data: { employeeId, type, title, body },
  });
  emitToEmployee(employeeId, 'notification:new', notif);
  return notif;
}

async function resolveComplianceTasks(certId) {
  await prisma.employeeTask.updateMany({
    where: { linkedCertId: certId, completedAt: null },
    data: { completedAt: new Date() },
  });
}

module.exports = { evaluateCompliance, createComplianceTask, createNotification, resolveComplianceTasks, RENEWAL_YEARS };
```

- [ ] **Step 2: Create compliance cron job**

Create `server/src/jobs/complianceCron.js`:

```js
const prisma = require('../lib/prisma');
const { evaluateCompliance, createComplianceTask, createNotification } = require('../services/complianceService');

async function runComplianceCheck() {
  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const expiringCerts = await prisma.employeeCertification.findMany({
    where: {
      expirationDate: { lte: thirtyDaysOut },
      status: { notIn: ['pending'] },
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  const employeesToEvaluate = new Set();

  for (const cert of expiringCerts) {
    const employeeId = cert.employee.id;
    employeesToEvaluate.add(employeeId);

    const isExpired = cert.expirationDate < now;
    const isExpiring = !isExpired;

    if (isExpiring) {
      const recentNotif = await prisma.notification.findFirst({
        where: {
          employeeId,
          type: 'reminder_30day',
          createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (!recentNotif) {
        await createNotification(employeeId, 'reminder_30day',
          `${cert.certType.replace(/_/g, ' ')} expiring soon`,
          `Your ${cert.certType.replace(/_/g, ' ')} expires on ${cert.expirationDate.toLocaleDateString()}. Please upload a renewal.`
        );
        await createComplianceTask(employeeId, cert.certType, cert.id);
      }
    }

    if (isExpired) {
      await createComplianceTask(employeeId, cert.certType, cert.id);
    }
  }

  for (const employeeId of employeesToEvaluate) {
    const status = await evaluateCompliance(employeeId);
    if (status === 'blocked') {
      const recentBlock = await prisma.notification.findFirst({
        where: { employeeId, type: 'blocked', createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
      });
      if (!recentBlock) {
        await createNotification(employeeId, 'blocked',
          'Compliance Blocked',
          'One or more certifications have expired. You cannot clock in via EVV until resolved.'
        );
      }
    }
  }

  console.log(`[Compliance] Checked ${expiringCerts.length} certs, evaluated ${employeesToEvaluate.size} employees`);
}

module.exports = { runComplianceCheck };
```

- [ ] **Step 3: Schedule the cron in index.js**

In `server/src/index.js`, add import:

```js
const { runComplianceCheck } = require('./jobs/complianceCron');
```

Add cron schedule (after existing schedules):

```js
    cron.schedule('0 6 * * *', async () => {
        console.log('[Cron] Running compliance check...');
        try {
            await runComplianceCheck();
        } catch (err) {
            console.error('[Cron] Compliance check failed:', err);
        }
    }, { timezone: 'America/Los_Angeles' });

    console.log('[Cron] Scheduled: compliance check (daily 6:00 AM PT)');
```

- [ ] **Step 4: Commit**

```bash
git add server/src/services/complianceService.js server/src/jobs/complianceCron.js server/src/index.js
git commit -m "feat: add daily compliance cron job with notifications and task creation"
```

---

## Phase 4: Frontend Pages (Employee App)

### Task 12: Frontend — HomePage

**Files:**
- Create: `employee-app/src/pages/HomePage.jsx`
- Modify: `employee-app/src/App.jsx`

- [ ] **Step 1: Create HomePage component**

Create `employee-app/src/pages/HomePage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

export default function HomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [nextShift, setNextShift] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getHomeSummary(),
      api.getNextShift(),
      api.getActivity(),
    ]).then(([s, ns, a]) => {
      setSummary(s);
      setNextShift(ns);
      setActivity(a);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  const firstName = user?.name?.split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="home-page">
      <h1 className="home-greeting">Good morning, {firstName}</h1>
      <p className="home-date">{today}</p>

      {summary?.requirementsOverdue > 0 && (
        <Link to="/requirements" className="compliance-banner">
          <strong>Compliance Alert:</strong> You have {summary.requirementsOverdue} expired certification(s).
          You cannot clock in via EVV until resolved.
        </Link>
      )}

      <div className="summary-grid">
        <div className="summary-tile">
          <span className="tile-number">{summary?.shiftsThisWeek || 0}</span>
          <span className="tile-label">Shifts this week</span>
        </div>
        <div className="summary-tile">
          <span className="tile-number">{summary?.hoursScheduled || 0}</span>
          <span className="tile-label">Hours scheduled</span>
        </div>
        <div className="summary-tile">
          <span className="tile-number">{summary?.requirementsOverdue || 0}</span>
          <span className="tile-label">Certs overdue</span>
        </div>
        <div className="summary-tile">
          <span className="tile-number">{summary?.openTasks || 0}</span>
          <span className="tile-label">Open tasks</span>
        </div>
      </div>

      {nextShift && (
        <div className="next-shift-card">
          <h3 className="card-heading">Next Shift</h3>
          <p className="shift-client">{nextShift.clientName}</p>
          <p className="shift-time">
            {new Date(nextShift.shiftDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' '}{nextShift.startTime} – {nextShift.endTime}
          </p>
          <span className="shift-service">{nextShift.serviceCode}</span>
        </div>
      )}

      {activity.length > 0 && (
        <div className="activity-section">
          <h3 className="card-heading">Recent Activity</h3>
          <ul className="activity-list">
            {activity.map(a => (
              <li key={a.id} className="activity-item">
                <span className="activity-title">{a.title}</span>
                <span className="activity-time">{new Date(a.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update App.jsx to use HomePage**

In `employee-app/src/App.jsx`, add import:
```jsx
import HomePage from './pages/HomePage';
```

Replace `<Route index element={<PlaceholderPage title="Home" />} />` with:
```jsx
<Route index element={<HomePage />} />
```

- [ ] **Step 3: Add homepage-specific CSS to index.css**

Append to `employee-app/src/index.css`:

```css
/* Home page */
.home-page { max-width: 600px; }
.home-greeting { font-size: 22px; font-weight: 700; }
.home-date { font-size: 14px; color: var(--text-muted); margin-bottom: 16px; }

.compliance-banner {
  display: block; background: hsl(0 72% 95%); color: var(--red); border: 1px solid hsl(0 72% 85%);
  padding: 12px 16px; border-radius: var(--card-radius); margin-bottom: 16px; text-decoration: none; font-size: 13px;
}

.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
@media (min-width: 768px) { .summary-grid { grid-template-columns: repeat(4, 1fr); } }
.summary-tile { background: var(--card-bg); border-radius: var(--card-radius); padding: 16px; box-shadow: var(--card-shadow); text-align: center; }
.tile-number { display: block; font-size: 28px; font-weight: 700; color: var(--navy); }
.tile-label { font-size: 12px; color: var(--text-muted); }

.next-shift-card { background: var(--card-bg); border-radius: var(--card-radius); padding: 16px; box-shadow: var(--card-shadow); border-left: 4px solid var(--navy); margin-bottom: 16px; }
.card-heading { font-size: 13px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.shift-client { font-size: 16px; font-weight: 600; }
.shift-time { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
.shift-service { display: inline-block; background: hsl(215 20% 95%); color: var(--slate-btn); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; margin-top: 8px; }

.activity-section { background: var(--card-bg); border-radius: var(--card-radius); padding: 16px; box-shadow: var(--card-shadow); }
.activity-list { list-style: none; }
.activity-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.activity-item:last-child { border-bottom: none; }
.activity-title { font-weight: 500; }
.activity-time { color: var(--text-muted); }

.page-loading { display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text-muted); }
```

- [ ] **Step 4: Commit**

```bash
git add employee-app/src/pages/HomePage.jsx employee-app/src/App.jsx employee-app/src/index.css
git commit -m "feat: add employee home page with summary tiles, next shift, and activity feed"
```

---

### Task 13: Frontend — RequirementsPage

**Files:**
- Create: `employee-app/src/pages/RequirementsPage.jsx`
- Create: `employee-app/src/components/common/CertCard.jsx`
- Create: `employee-app/src/components/common/UploadModal.jsx`
- Create: `employee-app/src/components/common/StatusBadge.jsx`
- Modify: `employee-app/src/App.jsx`

- [ ] **Step 1: Create StatusBadge component**

Create `employee-app/src/components/common/StatusBadge.jsx`:

```jsx
const STATUS_CONFIG = {
  approved: { label: 'Approved', className: 'badge--green' },
  active: { label: 'Approved', className: 'badge--green' },
  pending: { label: 'Pending Review', className: 'badge--amber' },
  rejected: { label: 'Needs Correction', className: 'badge--red' },
  not_submitted: { label: 'Not Submitted', className: 'badge--gray' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_submitted;
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
```

- [ ] **Step 2: Create UploadModal component**

Create `employee-app/src/components/common/UploadModal.jsx`:

```jsx
import { useState, useRef } from 'react';

export default function UploadModal({ certType, onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError('Please select a file');
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (note) formData.append('note', note);
      await onUpload(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Upload {certType.replace(/_/g, ' ')}</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="upload-area" onClick={() => inputRef.current?.click()}>
            {file ? <span className="upload-filename">{file.name}</span> : <span className="upload-prompt">Tap to select photo or PDF</span>}
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={e => setFile(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </div>
          <label className="field-label">Note (optional)</label>
          <input className="field-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional context..." />
          <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </button>
          <button type="button" className="btn btn-secondary btn-full" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CertCard component**

Create `employee-app/src/components/common/CertCard.jsx`:

```jsx
import StatusBadge from './StatusBadge';

const RENEWAL_INFO = {
  id_expiration: 'Per ID',
  tb_test: '1 year',
  cpr: '2 years',
  annual_training: '1 year',
  cultural_competency: '2 years',
  infection_control: '1 year',
  background_check: '5 years',
  other: 'Manual',
};

export default function CertCard({ cert, onUpload }) {
  const status = cert.status || 'not_submitted';
  const renewal = RENEWAL_INFO[cert.certType] || 'N/A';
  const title = cert.certType.replace(/_/g, ' ');

  let meta = '';
  if (status === 'approved' || status === 'active') {
    meta = cert.expirationDate ? `Expires: ${new Date(cert.expirationDate).toLocaleDateString()}` : 'No expiration set';
  } else if (status === 'pending') {
    meta = `Submitted: ${new Date(cert.updatedAt).toLocaleDateString()}`;
  } else if (status === 'rejected') {
    meta = cert.notes || 'Please re-upload';
  }

  const btnLabel = status === 'not_submitted' ? 'Upload' : status === 'rejected' ? 'Re-upload' : 'Upload New';

  return (
    <div className={`cert-card cert-card--${status}`}>
      <div className="cert-card-header">
        <span className="cert-card-title">{title}</span>
        <StatusBadge status={status} />
      </div>
      <span className="cert-card-renewal">Renewal: {renewal}</span>
      {meta && <p className="cert-card-meta">{meta}</p>}
      <button className="btn btn-primary btn-full cert-card-btn" onClick={onUpload}>{btnLabel}</button>
    </div>
  );
}
```

- [ ] **Step 4: Create RequirementsPage**

Create `employee-app/src/pages/RequirementsPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import CertCard from '../components/common/CertCard';
import UploadModal from '../components/common/UploadModal';

export default function RequirementsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadCert, setUploadCert] = useState(null);

  const load = useCallback(() => {
    api.getCertifications().then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(formData) {
    await api.uploadCertification(uploadCert.id, formData);
    load();
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  const { certifications, summary } = data || { certifications: [], summary: {} };

  return (
    <div className="requirements-page">
      <h1 className="page-title">Requirements</h1>

      <div className="cert-summary-bar">
        <span className="cert-summary-item cert-summary--green">{summary.approved} Approved</span>
        <span className="cert-summary-item cert-summary--amber">{summary.pending} Pending</span>
        <span className="cert-summary-item cert-summary--red">{summary.actionNeeded} Action Needed</span>
        <span className="cert-summary-item">{summary.total} Total</span>
      </div>

      <div className="cert-grid">
        {certifications.map(cert => (
          <CertCard key={cert.id} cert={cert} onUpload={() => setUploadCert(cert)} />
        ))}
      </div>

      {uploadCert && (
        <UploadModal
          certType={uploadCert.certType}
          onClose={() => setUploadCert(null)}
          onUpload={handleUpload}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update App.jsx import**

Add import and replace placeholder:
```jsx
import RequirementsPage from './pages/RequirementsPage';
```
Replace: `<Route path="requirements" element={<PlaceholderPage title="Requirements" />} />`
With: `<Route path="requirements" element={<RequirementsPage />} />`

- [ ] **Step 6: Add CSS for requirements page**

Append to `employee-app/src/index.css`:

```css
/* Requirements page */
.requirements-page { max-width: 800px; }
.page-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; }

.cert-summary-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.cert-summary-item { font-size: 13px; font-weight: 500; padding: 4px 10px; border-radius: 12px; background: hsl(220 14% 96%); }
.cert-summary--green { background: hsl(142 72% 92%); color: var(--green); }
.cert-summary--amber { background: hsl(38 92% 92%); color: var(--amber); }
.cert-summary--red { background: hsl(0 72% 94%); color: var(--red); }

.cert-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 600px) { .cert-grid { grid-template-columns: 1fr 1fr; } }

.cert-card { background: var(--card-bg); border-radius: var(--card-radius); padding: 16px; box-shadow: var(--card-shadow); border-left: 4px solid var(--gray-badge); }
.cert-card--approved, .cert-card--active { border-left-color: var(--green); }
.cert-card--pending { border-left-color: var(--amber); }
.cert-card--rejected { border-left-color: var(--red); }
.cert-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.cert-card-title { font-size: 14px; font-weight: 600; text-transform: capitalize; }
.cert-card-renewal { font-size: 12px; color: var(--text-muted); }
.cert-card-meta { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.cert-card-btn { margin-top: 12px; }

/* Status badge */
.status-badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 10px; white-space: nowrap; }
.badge--green { background: hsl(142 72% 92%); color: var(--green); }
.badge--amber { background: hsl(38 92% 92%); color: var(--amber); }
.badge--red { background: hsl(0 72% 94%); color: var(--red); }
.badge--gray { background: hsl(220 14% 96%); color: var(--gray-badge); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.modal-content { background: var(--card-bg); border-radius: var(--modal-radius); padding: 24px; width: 100%; max-width: 420px; }
.modal-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; text-transform: capitalize; }
.upload-area { border: 2px dashed var(--border); border-radius: var(--card-radius); padding: 24px; text-align: center; cursor: pointer; margin-bottom: 12px; }
.upload-area:hover { border-color: var(--navy); }
.upload-prompt { color: var(--text-muted); font-size: 14px; }
.upload-filename { font-size: 14px; font-weight: 500; }
.btn-secondary { background: var(--border); color: var(--text); margin-top: 8px; }
```

- [ ] **Step 7: Commit**

```bash
git add employee-app/src/pages/RequirementsPage.jsx employee-app/src/components/common/ employee-app/src/App.jsx employee-app/src/index.css
git commit -m "feat: add requirements page with cert cards, upload modal, and status badges"
```

---

### Task 14: Frontend — SchedulePage, AvailabilityPage, PayrollPage, TasksPage, ProfilePage, ChatPage

**Files:**
- Create: `employee-app/src/pages/SchedulePage.jsx`
- Create: `employee-app/src/pages/AvailabilityPage.jsx`
- Create: `employee-app/src/pages/PayrollPage.jsx`
- Create: `employee-app/src/pages/TasksPage.jsx`
- Create: `employee-app/src/pages/ProfilePage.jsx`
- Create: `employee-app/src/pages/ChatPage.jsx`
- Create: `employee-app/src/hooks/useSocket.js`
- Modify: `employee-app/src/App.jsx`

This is the largest task. Each page follows the same pattern (fetch data, render cards/lists). Implementation for each page should follow the patterns established in HomePage and RequirementsPage.

- [ ] **Step 1: Create useSocket hook**

Create `employee-app/src/hooks/useSocket.js`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(WS_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => { socket.disconnect(); };
  }, []);

  return { socket: socketRef.current, connected };
}
```

- [ ] **Step 2: Create SchedulePage**

Create `employee-app/src/pages/SchedulePage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0];
  });
  const [shifts, setShifts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getWeekSchedule(weekStart),
      api.getScheduleHistory(),
    ]).then(([sched, hist]) => {
      setShifts(sched.shifts || []);
      setHistory(hist || []);
    }).finally(() => setLoading(false));
  }, [weekStart]);

  function navigateWeek(offset) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  const shiftsByDay = {};
  shifts.forEach(s => {
    const day = new Date(s.shiftDate).getDay();
    if (!shiftsByDay[day]) shiftsByDay[day] = [];
    shiftsByDay[day].push(s);
  });

  return (
    <div className="schedule-page">
      <h1 className="page-title">My Schedule</h1>
      <div className="week-nav">
        <button className="btn btn-secondary" onClick={() => navigateWeek(-1)}>&larr;</button>
        <span className="week-label">Week of {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <button className="btn btn-secondary" onClick={() => navigateWeek(1)}>&rarr;</button>
      </div>
      <div className="schedule-grid">
        {DAYS.map((day, i) => (
          <div key={i} className="schedule-day">
            <div className="schedule-day-header">{day}</div>
            {shiftsByDay[i]?.map(s => (
              <div key={s.id} className="schedule-shift">
                <span className="shift-client-name">{s.client?.clientName}</span>
                <span className="shift-times">{s.startTime} – {s.endTime}</span>
              </div>
            )) || <span className="schedule-empty">—</span>}
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <div className="schedule-history">
          <h3 className="card-heading">Schedule History</h3>
          <table className="simple-table">
            <thead><tr><th>Period</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td>{new Date(h.weekStart).toLocaleDateString()}</td>
                  <td>{h.sentAt ? new Date(h.sentAt).toLocaleDateString() : '—'}</td>
                  <td>{h.confirmedAt ? 'Confirmed' : h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create AvailabilityPage**

Create `employee-app/src/pages/AvailabilityPage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

const REASONS = ['vacation', 'sick_leave', 'personal', 'medical'];

export default function AvailabilityPage() {
  const [availability, setAvailability] = useState(null);
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [form, setForm] = useState({ dateFrom: '', dateTo: '', reason: 'vacation' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getAvailability().then(d => setAvailability(d.availability));
    api.getTimeOffRequests().then(setTimeOffRequests);
  }, []);

  async function handleTimeOffSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.submitTimeOff(form);
      const updated = await api.getTimeOffRequests();
      setTimeOffRequests(updated);
      setShowTimeOff(false);
      setForm({ dateFrom: '', dateTo: '', reason: 'vacation' });
    } finally { setSubmitting(false); }
  }

  return (
    <div className="availability-page">
      <h1 className="page-title">Availability & Time Off</h1>

      <div className="card">
        <h3 className="card-heading">Current Availability</h3>
        {availability ? (
          <pre className="availability-summary">{JSON.stringify(availability, null, 2)}</pre>
        ) : (
          <p className="text-muted">No availability set</p>
        )}
        <button className="btn btn-secondary" style={{ marginTop: 8 }}>Request a Change</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header-row">
          <h3 className="card-heading">Time Off Requests</h3>
          <button className="btn btn-primary" onClick={() => setShowTimeOff(true)}>Request Time Off</button>
        </div>
        {timeOffRequests.length === 0 ? (
          <p className="text-muted">No requests</p>
        ) : (
          <table className="simple-table">
            <thead><tr><th>From</th><th>To</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {timeOffRequests.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.dateFrom).toLocaleDateString()}</td>
                  <td>{new Date(r.dateTo).toLocaleDateString()}</td>
                  <td>{r.reason.replace(/_/g, ' ')}</td>
                  <td><span className={`status-badge badge--${r.status === 'approved' ? 'green' : r.status === 'declined' ? 'red' : 'amber'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showTimeOff && (
        <div className="modal-overlay" onClick={() => setShowTimeOff(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Request Time Off</h2>
            <form onSubmit={handleTimeOffSubmit}>
              <label className="field-label">From</label>
              <input type="date" className="field-input" value={form.dateFrom} onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} required />
              <label className="field-label">To</label>
              <input type="date" className="field-input" value={form.dateTo} onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} required />
              <label className="field-label">Reason</label>
              <select className="field-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                {REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
              <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowTimeOff(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create PayrollPage**

Create `employee-app/src/pages/PayrollPage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export default function PayrollPage() {
  const [summary, setSummary] = useState(null);
  const [stubs, setStubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getPayrollSummary(), api.getPaystubs()])
      .then(([s, st]) => { setSummary(s); setStubs(st); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="payroll-page">
      <h1 className="page-title">Payroll</h1>

      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-tile">
          <span className="tile-number">${summary?.lastPaycheck?.amount || '0'}</span>
          <span className="tile-label">Last Paycheck</span>
        </div>
        <div className="summary-tile">
          <span className="tile-number">${summary?.ytdEarnings || '0'}</span>
          <span className="tile-label">YTD Earnings</span>
        </div>
        <div className="summary-tile">
          <span className="tile-number">{summary?.currentPeriodHours || '0'}</span>
          <span className="tile-label">Hours This Period</span>
        </div>
      </div>

      <div className="card">
        <h3 className="card-heading">Pay Stubs</h3>
        {stubs.length === 0 ? (
          <p className="text-muted">No pay stubs available</p>
        ) : (
          <table className="simple-table">
            <thead><tr><th>Period</th><th>Paid</th><th>Hours</th><th>Net Pay</th></tr></thead>
            <tbody>
              {stubs.map(s => (
                <tr key={s.id}>
                  <td>{new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}</td>
                  <td>{new Date(s.payDate).toLocaleDateString()}</td>
                  <td>{Number(s.totalHours)}</td>
                  <td>${Number(s.netPay).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create TasksPage**

Create `employee-app/src/pages/TasksPage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getTasks().then(setTasks).finally(() => setLoading(false)); }, []);

  async function handleComplete(id) {
    await api.completeTask(id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completedAt: new Date().toISOString() } : t));
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  const incomplete = tasks.filter(t => !t.completedAt);
  const completed = tasks.filter(t => t.completedAt);

  return (
    <div className="tasks-page">
      <h1 className="page-title">Tasks</h1>
      {incomplete.length === 0 && completed.length === 0 && <p className="text-muted">No tasks</p>}
      <ul className="task-list">
        {incomplete.map(t => (
          <li key={t.id} className="task-item">
            <button
              className={`task-check ${t.source === 'compliance' ? 'task-check--disabled' : ''}`}
              onClick={() => t.source !== 'compliance' && handleComplete(t.id)}
              disabled={t.source === 'compliance'}
            />
            <div className="task-content">
              <span className="task-title">{t.title}</span>
              {t.source === 'compliance' && <span className="task-source">Auto-resolves on cert approval</span>}
            </div>
          </li>
        ))}
        {completed.map(t => (
          <li key={t.id} className="task-item task-item--done">
            <span className="task-check task-check--done">✓</span>
            <span className="task-title">{t.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Create ProfilePage**

Create `employee-app/src/pages/ProfilePage.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then(p => { setProfile(p); setForm({ name: p.name, phone: p.phone, email: p.email, address: p.address }); });
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateProfile(form);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  if (!profile) return <div className="page-loading">Loading...</div>;

  return (
    <div className="profile-page">
      <h1 className="page-title">My Profile</h1>
      <form className="card" onSubmit={handleSave} style={{ padding: 16 }}>
        <label className="field-label">Name</label>
        <input className="field-input" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <label className="field-label">Phone</label>
        <input className="field-input" type="tel" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <label className="field-label">Email</label>
        <input className="field-input" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <label className="field-label">Address</label>
        <input className="field-input" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        <button type="submit" className="btn btn-primary btn-full" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        {saved && <p className="save-success">Profile updated</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Create ChatPage**

Create `employee-app/src/pages/ChatPage.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useSocket } from '../hooks/useSocket';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const bottomRef = useRef();

  useEffect(() => {
    api.getMessages().then(d => { setMessages(d.messages || []); }).finally(() => setLoading(false));
    api.markRead();
  }, []);

  useEffect(() => {
    if (!socket) return;
    function onMessage(msg) {
      setMessages(prev => [...prev, msg]);
    }
    socket.on('chat:message', onMessage);
    return () => socket.off('chat:message', onMessage);
  }, [socket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');
    if (socket) {
      socket.emit('chat:message', { content });
    } else {
      const msg = await api.sendMessage(content);
      setMessages(prev => [...prev, msg]);
    }
  }

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="chat-page">
      <h1 className="page-title">Communication</h1>
      <div className="chat-messages">
        {messages.length === 0 && <p className="text-muted chat-empty">No messages yet. Send a message to the office.</p>}
        {messages.map(m => (
          <div key={m.id} className={`chat-bubble ${m.senderRole === 'pca' ? 'chat-bubble--mine' : 'chat-bubble--office'}`}>
            <p className="chat-text">{m.content}</p>
            <span className="chat-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-bar" onSubmit={handleSend}>
        <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." />
        <button type="submit" className="btn btn-primary">Send</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Update App.jsx with all page imports**

Replace the entire `employee-app/src/App.jsx`:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import EmployeeLayout from './components/layout/EmployeeLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import SchedulePage from './pages/SchedulePage';
import AvailabilityPage from './pages/AvailabilityPage';
import RequirementsPage from './pages/RequirementsPage';
import PayrollPage from './pages/PayrollPage';
import ChatPage from './pages/ChatPage';
import TasksPage from './pages/TasksPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <EmployeeLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<HomePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="availability" element={<AvailabilityPage />} />
          <Route path="requirements" element={<RequirementsPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 9: Add CSS for remaining pages**

Append to `employee-app/src/index.css`:

```css
/* Shared */
.card { background: var(--card-bg); border-radius: var(--card-radius); box-shadow: var(--card-shadow); padding: 16px; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.text-muted { color: var(--text-muted); font-size: 13px; }
.save-success { color: var(--green); font-size: 13px; margin-top: 8px; text-align: center; }

/* Schedule */
.schedule-page { max-width: 800px; }
.week-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.week-label { font-size: 15px; font-weight: 600; }
.schedule-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 24px; }
@media (max-width: 600px) { .schedule-grid { grid-template-columns: 1fr; } }
.schedule-day { background: var(--card-bg); border-radius: 6px; padding: 8px; min-height: 60px; }
.schedule-day-header { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
.schedule-shift { font-size: 12px; margin-bottom: 4px; }
.shift-client-name { display: block; font-weight: 500; }
.shift-times { color: var(--text-muted); }
.schedule-empty { color: var(--text-muted); font-size: 12px; }
.schedule-history { margin-top: 16px; }

/* Simple table */
.simple-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.simple-table th { text-align: left; font-weight: 600; padding: 8px 4px; border-bottom: 1px solid var(--border); font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
.simple-table td { padding: 8px 4px; border-bottom: 1px solid var(--border); }

/* Availability */
.availability-page { max-width: 600px; }
.availability-summary { font-size: 12px; background: hsl(220 14% 97%); padding: 8px; border-radius: 4px; overflow-x: auto; }

/* Tasks */
.tasks-page { max-width: 600px; }
.task-list { list-style: none; }
.task-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.task-item--done { opacity: 0.5; }
.task-check { width: 20px; height: 20px; border: 2px solid var(--border); border-radius: 4px; background: none; cursor: pointer; flex-shrink: 0; margin-top: 2px; }
.task-check:hover { border-color: var(--navy); }
.task-check--disabled { cursor: not-allowed; opacity: 0.5; }
.task-check--done { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: var(--green); color: #fff; border-radius: 4px; font-size: 12px; flex-shrink: 0; }
.task-content { flex: 1; }
.task-title { font-size: 14px; font-weight: 500; }
.task-source { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }

/* Chat */
.chat-page { max-width: 600px; display: flex; flex-direction: column; height: calc(100dvh - var(--bottom-bar-height) - 32px); }
@media (min-width: 768px) { .chat-page { height: calc(100dvh - 32px); } }
.chat-messages { flex: 1; overflow-y: auto; padding: 8px 0; display: flex; flex-direction: column; gap: 8px; }
.chat-empty { text-align: center; padding: 40px; }
.chat-bubble { max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; }
.chat-bubble--mine { align-self: flex-end; background: var(--blue-chat); color: #fff; border-bottom-right-radius: 4px; }
.chat-bubble--office { align-self: flex-start; background: hsl(220 14% 96%); color: var(--text); border-bottom-left-radius: 4px; }
.chat-text { margin: 0; }
.chat-time { font-size: 10px; opacity: 0.7; margin-top: 4px; display: block; }
.chat-input-bar { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.chat-input { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 20px; font-size: 14px; outline: none; }
.chat-input:focus { border-color: var(--navy); }

/* Payroll */
.payroll-page { max-width: 700px; }

/* Profile */
.profile-page { max-width: 500px; }
```

- [ ] **Step 10: Commit**

```bash
git add employee-app/src/
git commit -m "feat: add all employee portal pages (schedule, availability, payroll, tasks, profile, chat)"
```

---

## Phase 5: Integration & Polish

### Task 15: CORS Configuration + Admin Chat Integration

**Files:**
- Modify: `server/src/app.js`
- Create: `server/src/controllers/employeePortal/adminChatController.js`
- Modify: `server/src/routes/api.js`

- [ ] **Step 1: Update CORS to allow employee portal origin**

In `server/src/app.js`, update the CORS configuration:

```js
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.EMPLOYEE_APP_ORIGIN,
    process.env.ADMIN_APP_ORIGIN,
  ].filter(Boolean),
  credentials: true,
}));
```

- [ ] **Step 2: Create admin chat controller**

Create `server/src/controllers/employeePortal/adminChatController.js`:

```js
const prisma = require('../../lib/prisma');
const { emitToEmployee } = require('../../socket');

async function listConversations(req, res) {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    include: {
      employee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const enriched = conversations.map(c => ({
    id: c.id,
    employeeId: c.employee.id,
    employeeName: c.employee.name,
    lastMessage: c.messages[0] || null,
    lastMessageAt: c.lastMessageAt,
    unreadCount: 0,
  }));

  // Count unread per conversation
  for (const conv of enriched) {
    conv.unreadCount = await prisma.message.count({
      where: { conversationId: conv.id, senderRole: 'pca', readAt: null },
    });
  }

  res.json(enriched);
}

async function getConversationMessages(req, res) {
  const id = parseInt(req.params.id);
  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { name: true } } },
  });
  res.json(messages);
}

async function adminSendMessage(req, res) {
  const conversationId = parseInt(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });

  const msg = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      senderRole: req.user.role,
      content: content.trim(),
    },
    include: { sender: { select: { name: true } } },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  emitToEmployee(convo.employeeId, 'chat:message', {
    id: msg.id, content: msg.content, senderId: msg.senderId, senderRole: msg.senderRole, createdAt: msg.createdAt,
  });

  res.status(201).json(msg);
}

module.exports = { listConversations, getConversationMessages, adminSendMessage };
```

- [ ] **Step 3: Add admin chat routes**

In `server/src/routes/api.js`, add import (with other requires):

```js
const { listConversations, getConversationMessages, adminSendMessage } = require('../controllers/employeePortal/adminChatController');
```

Add routes (in the admin-protected section):

```js
// Employee chat (admin)
router.get('/conversations', requireRole('admin', 'user'), listConversations);
router.get('/conversations/:id/messages', requireRole('admin', 'user'), getConversationMessages);
router.post('/conversations/:id/messages', requireRole('admin', 'user'), adminSendMessage);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/app.js server/src/controllers/employeePortal/adminChatController.js server/src/routes/api.js
git commit -m "feat: add CORS config and admin chat endpoints for employee conversations"
```

---

### Task 16: Add .gitignore Entry + Employee App Build Script

**Files:**
- Modify: `.gitignore`
- Create: `employee-app/.gitignore`

- [ ] **Step 1: Create employee-app .gitignore**

Create `employee-app/.gitignore`:

```
node_modules
dist
.env
.env.local
```

- [ ] **Step 2: Add worktrees to root .gitignore if not already there**

Check and add if needed:
```bash
grep -q "worktrees/" .gitignore || echo "worktrees/" >> .gitignore
```

- [ ] **Step 3: Commit**

```bash
git add employee-app/.gitignore .gitignore
git commit -m "chore: add gitignore for employee app"
```

---

### Task 17: Final Integration Test — End-to-End Smoke Test

**Files:** None (test run only)

- [ ] **Step 1: Start the server**

```bash
cd server && node src/index.js &
SERVER_PID=$!
sleep 2
```

- [ ] **Step 2: Start the employee app dev server**

```bash
cd employee-app && npx vite --port 5174 &
CLIENT_PID=$!
sleep 3
```

- [ ] **Step 3: Verify employee login works**

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<test-pca-email>","password":"<test-password>"}' | head -c 200
```

Expected: JSON response with `token` and `user` with `role: "pca"`.

- [ ] **Step 4: Verify employee endpoints are scoped**

```bash
TOKEN="<jwt-from-step-3>"
curl -s http://localhost:4000/api/employee/profile -H "Authorization: Bearer $TOKEN" | head -c 200
```

Expected: JSON with employee profile data or 403 if no employee linked.

- [ ] **Step 5: Stop servers**

```bash
kill $SERVER_PID $CLIENT_PID
```

- [ ] **Step 6: Final commit (if any fixups were needed)**

```bash
git status
# If clean, no commit needed
```

---

## Summary

| Phase | Tasks | What Ships |
|-------|-------|-----------|
| 1: Foundation | 1-3 | Schema, auth middleware, PWA scaffold with responsive nav |
| 2: Core Modules | 4-8 | All backend REST endpoints (profile, home, requirements, schedule, availability, payroll, tasks) |
| 3: Real-Time | 9-11 | Socket.io chat, notifications, compliance cron |
| 4: Frontend | 12-14 | All 8 pages fully functional |
| 5: Integration | 15-17 | CORS, admin chat, smoke test |

Total: 17 tasks, each independently committable and testable.
