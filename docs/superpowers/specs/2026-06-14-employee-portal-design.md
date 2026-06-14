# Employee Portal App — Design Spec

**Date:** 2026-06-14  
**Status:** Approved  
**Platform:** PWA (mobile-responsive web app)  
**Deployment:** Separate Railway service (static), same monorepo  
**API:** Extends existing Express server (Approach A — unified backend)

---

## 1. Project Structure

```
employee-app/                    ← New PWA (separate Railway service)
  src/
    pages/
      HomePage.jsx
      SchedulePage.jsx
      AvailabilityPage.jsx
      RequirementsPage.jsx
      PayrollPage.jsx
      ChatPage.jsx
      TasksPage.jsx
      ProfilePage.jsx
      LoginPage.jsx
    components/
      layout/
        EmployeeLayout.jsx       ← Responsive shell (sidebar desktop / bottom tabs mobile)
        BottomTabBar.jsx
        EmployeeSidebar.jsx
      common/
        SummaryTile.jsx
        CertCard.jsx
        StatusBadge.jsx
        ChatBubble.jsx
        TaskItem.jsx
        UploadModal.jsx
        TimeOffModal.jsx
        AvailabilityModal.jsx
    hooks/
      useAuth.js                 ← JWT auth, resolves employee link
      useSocket.js               ← Socket.io connection + event handlers
      useNotifications.js        ← In-app + push notification state
    api.js                       ← API client (VITE_API_URL base)
    socket.js                    ← Socket.io client setup
  public/
    manifest.json                ← PWA manifest
    sw.js                        ← Service worker
    icons/                       ← App icons (192, 512)
  index.html
  vite.config.js
  package.json

server/src/                      ← Existing Express app (extended)
  routes/
    employee.js                  ← /api/employee/* routes
  controllers/
    employeePortal/
      homeController.js
      scheduleController.js
      availabilityController.js
      requirementsController.js
      payrollController.js       ← Employee-facing payroll (not admin payroll)
      chatController.js
      tasksController.js
      profileController.js
  services/
    complianceService.js         ← Status computation + cron logic
    chatService.js               ← Message CRUD + conversation management
  middleware/
    requireEmployeeLink.js       ← Resolves req.user → Employee record
  socket.js                      ← Socket.io server setup
  cron/
    complianceCron.js            ← Daily compliance scanner
```

---

## 2. Authentication & Authorization

### Flow
1. Employee logs in at `/login` with email + password
2. Same `/api/auth/login` endpoint, returns JWT (24h expiry)
3. User record has `role: 'pca'` and `Employee.userId` FK link
4. All `/api/employee/*` routes use: `authenticate()` → `requireEmployeeLink()`

### requireEmployeeLink Middleware
```js
// Resolves authenticated user to their Employee record
// Attaches req.employee with full employee data
// Returns 403 if no Employee linked to this User
async function requireEmployeeLink(req, res, next) {
  const employee = await prisma.employee.findUnique({
    where: { userId: req.user.id }
  });
  if (!employee) return res.status(403).json({ error: 'No employee profile linked' });
  req.employee = employee;
  next();
}
```

### Scoping Rule
Every employee endpoint filters by `req.employee.id` — employees can only access their own data.

---

## 3. Data Model Extensions

### New Models

```prisma
model CertificationUpload {
  id              Int       @id @default(autoincrement())
  certificationId Int
  certification   EmployeeCertification @relation(fields: [certificationId], references: [id], onDelete: Cascade)
  bucketKey       String                // Railway Object Storage path
  fileName        String
  fileSize        Int
  fileType        String
  note            String    @default("")
  submittedAt     DateTime  @default(now())

  @@map("certification_uploads")
}

model AvailabilityRequest {
  id               Int       @id @default(autoincrement())
  employeeId       Int
  employee         Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  requestedChanges Json                  // { days, shiftTimes, maxHours, maxClients }
  status           String    @default("pending")  // pending | approved | declined
  adminNote        String    @default("")
  reviewedBy       Int?
  reviewedAt       DateTime?
  createdAt        DateTime  @default(now())

  @@map("availability_requests")
}

model TimeOffRequest {
  id          Int       @id @default(autoincrement())
  employeeId  Int
  employee    Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  dateFrom    DateTime
  dateTo      DateTime
  reason      String                     // vacation | sick_leave | personal | medical
  status      String    @default("pending")  // pending | approved | declined
  adminNote   String    @default("")
  reviewedBy  Int?
  reviewedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@map("time_off_requests")
}

model Conversation {
  id            Int       @id @default(autoincrement())
  employeeId    Int       @unique
  employee      Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  lastMessageAt DateTime  @default(now())
  messages      Message[]
  createdAt     DateTime  @default(now())

  @@map("conversations")
}

model Message {
  id             Int       @id @default(autoincrement())
  conversationId Int
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId       Int
  sender         User      @relation(fields: [senderId], references: [id])
  senderRole     String                  // admin | pca
  content        String
  readAt         DateTime?
  createdAt      DateTime  @default(now())

  @@map("messages")
}

model EmployeeTask {
  id            Int       @id @default(autoincrement())
  employeeId    Int
  employee      Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  title         String
  description   String    @default("")
  source        String                   // compliance | office_assigned
  linkedCertId  Int?                     // nullable — auto-resolves when cert approved
  completedAt   DateTime?
  createdAt     DateTime  @default(now())

  @@map("employee_tasks")
}

model Paystub {
  id             Int       @id @default(autoincrement())
  employeeId     Int
  employee       Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  payPeriodStart DateTime
  payPeriodEnd   DateTime
  paidDate       DateTime
  amount         Float
  bucketKey      String                  // PDF in Railway Object Storage
  createdAt      DateTime  @default(now())

  @@map("paystubs")
}

model PushSubscription {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String
  p256dh    String
  auth      String
  createdAt DateTime  @default(now())

  @@map("push_subscriptions")
}

model Notification {
  id          Int       @id @default(autoincrement())
  employeeId  Int
  employee    Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  type        String                     // cert_approved | cert_rejected | schedule_sent | time_off_approved | time_off_declined | reminder_30day | blocked
  title       String
  body        String
  readAt      DateTime?
  createdAt   DateTime  @default(now())

  @@map("notifications")
}
```

### Extensions to Existing Models

```prisma
model Employee {
  // Add fields:
  complianceStatus  String    @default("ok")    // "ok" | "blocked"
  availability      Json?                        // current approved availability

  // Add relations:
  availabilityRequests  AvailabilityRequest[]
  timeOffRequests       TimeOffRequest[]
  conversation          Conversation?
  employeeTasks         EmployeeTask[]
  paystubs              Paystub[]
  notifications         Notification[]
}

model EmployeeCertification {
  // Add relation:
  uploads  CertificationUpload[]
}

model User {
  // Add relations:
  messages          Message[]
  pushSubscriptions PushSubscription[]
}
```

---

## 4. API Endpoints

All under `/api/employee/` with `authenticate()` + `requireEmployeeLink()`.

### Home
| Method | Path | Description |
|--------|------|-------------|
| GET | `/home/summary` | Summary tiles (shifts count, hours, overdue certs, open tasks) |
| GET | `/home/next-shift` | Next upcoming shift |
| GET | `/home/activity` | Recent 10 notifications |

### Schedule
| Method | Path | Description |
|--------|------|-------------|
| GET | `/schedule/week?date=YYYY-MM-DD` | Shifts for specified week |
| GET | `/schedule/history` | ScheduleNotification records |
| GET | `/schedule/pdf?date=YYYY-MM-DD` | Download week schedule as PDF |

### Availability & Time Off
| Method | Path | Description |
|--------|------|-------------|
| GET | `/availability` | Current approved availability |
| POST | `/availability/request` | Submit availability change request |
| GET | `/time-off` | List all time-off requests |
| POST | `/time-off` | Submit new time-off request |

### Requirements
| Method | Path | Description |
|--------|------|-------------|
| GET | `/certifications` | All certs with current status + summary counts |
| POST | `/certifications/:certId/upload` | Upload file for certification (multipart) |

### Payroll
| Method | Path | Description |
|--------|------|-------------|
| GET | `/payroll/summary` | Last paycheck, YTD, current period hours |
| GET | `/payroll/stubs` | List all paystubs |
| GET | `/payroll/stubs/:id/download` | Presigned URL for PDF download |

### Communication
| Method | Path | Description |
|--------|------|-------------|
| GET | `/chat/messages?before=cursor` | Paginated message history |
| POST | `/chat/messages` | Send message (also emits via socket) |
| PATCH | `/chat/read` | Mark messages as read up to timestamp |
| GET | `/notifications` | All notifications (paginated) |
| PATCH | `/notifications/read` | Mark notifications as read |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | All tasks (incomplete first) |
| PATCH | `/tasks/:id/complete` | Mark office-assigned task as done |

### Profile
| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile` | Employee profile data |
| PATCH | `/profile` | Update name, phone, email, address |

### Push Notifications
| Method | Path | Description |
|--------|------|-------------|
| POST | `/push/subscribe` | Register push subscription |
| DELETE | `/push/subscribe` | Unregister push subscription |

---

## 5. WebSocket Events (Socket.io)

### Connection
- Client connects with `auth: { token: JWT }` in handshake
- Server validates token, joins socket to room `employee:{employeeId}`
- Admin users join room `office`

### Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `chat:message` | client→server | `{ content }` | Employee sends message |
| `chat:message` | server→client | `{ id, content, senderId, senderRole, createdAt }` | New message received |
| `chat:typing` | bidirectional | `{ conversationId }` | Typing indicator |
| `chat:read` | client→server | `{ upTo: messageId }` | Mark as read |
| `notification:new` | server→client | `{ id, type, title, body }` | Push notification |
| `task:update` | server→client | `{ id, status }` | Task auto-resolved |

---

## 6. Compliance Engine

### Daily Cron Job (`complianceCron.js`)

Runs at 6:00 AM daily:

1. **Query** all EmployeeCertifications with `expirationDate` in the next 30 days or past
2. **30-day reminders**: cert expires within 30 days, no reminder sent in last 7 days for this cert
   - Send SMS + email via Brevo
   - Create in-app Notification
   - Create EmployeeTask (source: `compliance`, linkedCertId set)
   - Push via Socket.io if employee connected
3. **Expiration blocking**: cert past expiration, no approved renewal uploaded
   - Set `employee.complianceStatus = 'blocked'`
   - Send urgent notification (email + SMS + in-app + push)
4. **Unblocking check**: re-evaluate all certs for employee — if all valid, set `complianceStatus = 'ok'`

### On-Demand Re-evaluation

Triggered when:
- Admin approves a cert → re-check all certs → maybe unblock
- Admin rejects a cert → create task + notification
- New upload submitted → no status change (stays pending until reviewed)

### Renewal Periods (for auto-calculating expiration)
| Cert Type | Renewal |
|-----------|---------|
| ID Expiration | Per ID (admin enters manually) |
| TB Test | 1 year |
| CPR | 2 years |
| 8hr Annual Training | 1 year |
| Cultural Competency | 2 years |
| Infection Control | 1 year |
| Background Check | 5 years |
| Other | Admin enters manually |

---

## 7. File Storage (Railway Object Storage)

### Migration from DB Bytes
The existing `EmployeeCertification.fileData` (Bytes in DB) approach continues working for admin-initiated uploads on the Certifications tab. New employee-initiated uploads via the portal use Railway Object Storage exclusively. Over time, migrate admin uploads to Object Storage too, but this is not required for launch.

### Bucket Structure
```
certs/{employeeId}/{certType}/{timestamp}-{filename}
paystubs/{employeeId}/{YYYY-MM-DD}_{YYYY-MM-DD}.pdf
```

### Upload Flow (Certifications)
1. Employee selects file (image or PDF, max 10MB)
2. Frontend sends multipart POST to `/api/employee/certifications/:certId/upload`
3. Server validates file type/size
4. Server uploads to Railway Object Storage → gets `bucketKey`
5. Server creates `CertificationUpload` record with bucketKey
6. Server updates `EmployeeCertification.status = 'pending'`
7. Server triggers notification to admin (new cert upload to review)
8. Returns success → frontend updates card to "Pending Review"

### Download Flow (Admin Only)
1. Admin clicks download on Certifications tab
2. Server generates presigned URL (5-minute expiry) from bucketKey
3. Returns URL → browser downloads file

### Paystub Upload (Admin)
1. Admin uploads paystub PDF (or auto-generated from payroll run)
2. Stored in bucket at `paystubs/{employeeId}/{period}.pdf`
3. Creates Paystub record
4. Notification sent to employee

---

## 8. PWA Configuration

### manifest.json
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

### Service Worker Strategy
- **App shell**: cache-first (HTML, CSS, JS bundles)
- **API calls**: network-first with stale-while-revalidate fallback
- **Push events**: show native notification, tap navigates to relevant page
- **Offline**: show cached data with "You're offline" banner, queue outgoing messages for retry

### Push Notifications (Web Push API)
- Server uses `web-push` library with VAPID keys
- Employee subscribes on first login (browser permission prompt)
- Subscription stored in `PushSubscription` table
- Triggered by: cert approved/rejected, schedule sent, time-off decision, compliance blocked, new chat message (when offline)

---

## 9. Deployment

### Railway Services

| Service | Directory | Build Command | Start Command | Domain |
|---------|-----------|---------------|---------------|--------|
| `nvbestpca` (existing) | `server/` + `client/` | `cd client && npm run build` | `prisma migrate deploy && node prisma/seed.js && node src/index.js` | app.pcalink.com |
| `employee-portal` (new) | `employee-app/` | `npm run build` | Static serve of `dist/` | employee.pcalink.com |

### Environment Variables

**employee-portal (frontend):**
```
VITE_API_URL=https://app.pcalink.com
VITE_WS_URL=wss://app.pcalink.com
VITE_VAPID_PUBLIC_KEY=<generated>
```

**nvbestpca (backend additions):**
```
RAILWAY_OBJECT_STORAGE_ACCESS_KEY=<from Railway>
RAILWAY_OBJECT_STORAGE_SECRET_KEY=<from Railway>
RAILWAY_OBJECT_STORAGE_ENDPOINT=<from Railway>
RAILWAY_BUCKET_NAME=nvbestpca-files
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
WEB_PUSH_CONTACT=mailto:admin@pcalink.com
```

### CORS Configuration
Add `employee.pcalink.com` to allowed origins in Express CORS config.

---

## 10. Admin-Side Integration Points

These additions to the existing admin app support the employee portal:

### Certification Review Workflow (existing screen, enhanced)
- When admin approves/rejects cert: update CertificationUpload status, trigger Socket.io notification to employee, auto-resolve linked EmployeeTask if approved, re-evaluate complianceStatus

### New Admin Features
| Feature | Location | Description |
|---------|----------|-------------|
| Chat Inbox | New page or Dashboard section | List all conversations, unread count, reply interface |
| Availability Requests | EmployeeDetailPage tab or new page | Pending requests with approve/decline + note |
| Time-Off Requests | EmployeeDetailPage tab or new page | Pending requests with approve/decline + note |
| Paystub Management | EmployeeDetailPage Payroll tab | Upload paystub PDFs or auto-generate from payroll runs |
| Task Assignment | EmployeeDetailPage Tasks tab | Create office-assigned tasks for employees |

---

## 11. UI/UX Specifications

### Visual Identity
- Navy sidebar/header (`hsl(222 47% 11%)`)
- Slate-blue buttons (`hsl(215 20% 50%)`)
- White cards with subtle shadow (`0 1px 3px rgba(0,0,0,0.1)`)
- Rounded corners: 8px (cards), 6px (buttons), 12px (modals)
- Font: Inter, 14px base, weights 400/500/600/700
- Spacing: 8px base unit

### Navigation

**Mobile (< 768px):** Fixed bottom tab bar, 56px height
- 5 visible tabs: Home, Schedule, Requirements, Payroll, Chat
- "More" overflow: Availability, Tasks, Profile
- Active: filled icon + label + navy accent
- Badges: red dot for action items

**Desktop (>= 768px):** Left sidebar, 240px wide
- Navy background, white icons/text
- All 8 sections visible
- Collapsible to 52px (icon-only)

### Component Patterns

**Summary Tiles:** 2x2 grid mobile, 4-across desktop. White card, 16px padding, icon (24px, muted), large number (28px, 700 weight), label (12px, muted).

**Certification Cards:** White card, 4px left border (status-colored). Header row: icon + title + renewal period. Status badge right-aligned. Meta line below (date or rejection note). Action button full-width at bottom.

**Chat Interface:** Messages in scrollable container. Employee bubbles right (blue bg `hsl(215 80% 55%)`, white text). Office bubbles left (gray bg `hsl(220 14% 96%)`, dark text). Timestamps below clusters. Input bar fixed at bottom with text field + send button.

### Status Colors
| Status | Color | Hex |
|--------|-------|-----|
| Approved | Green | `hsl(142 72% 40%)` |
| Pending Review | Amber | `hsl(38 92% 50%)` |
| Needs Correction | Red | `hsl(0 72% 50%)` |
| Not Submitted | Gray | `hsl(240 5% 65%)` |
| Blocked (banner) | Red | `hsl(0 72% 50%)` bg with white text |
| OK | Green | `hsl(142 72% 40%)` |

### Loading & Empty States
- Skeleton placeholders (pulsing gray rectangles) while loading
- Empty states: centered icon + message + CTA button
- Pull-to-refresh on mobile (schedule, chat, tasks)
- Toast notifications: 3-second auto-dismiss, bottom-center on mobile

---

## 12. Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + React Router |
| Styling | Custom CSS (matching admin app tokens) |
| State | React Context (auth, socket) + local state |
| Real-time | Socket.io client |
| PWA | Vite PWA plugin (vite-plugin-pwa) |
| Backend | Express.js (existing) |
| ORM | Prisma (existing, extended schema) |
| Database | PostgreSQL (existing, Railway) |
| File Storage | Railway Object Storage (S3-compatible) |
| WebSocket | Socket.io server (attached to Express) |
| Push | web-push library + VAPID |
| Notifications | Brevo (existing) for email/SMS |
| Cron | node-cron (compliance scanner) |
| Deployment | Railway (2 services from 1 repo) |

---

## 13. Security Considerations

- All employee endpoints scoped to `req.employee.id` — no cross-employee data access
- File upload validation: max 10MB, allowed types (image/*, application/pdf)
- Presigned URLs expire in 5 minutes (admin cert downloads)
- Employees cannot download/view uploaded cert files after submission
- WebSocket auth via JWT in handshake — invalid token = connection refused
- Rate limiting on upload endpoint (5 uploads per hour per employee)
- CORS restricted to employee portal domain
- Input sanitization on chat messages (XSS prevention)
- Push subscription validated against authenticated user
