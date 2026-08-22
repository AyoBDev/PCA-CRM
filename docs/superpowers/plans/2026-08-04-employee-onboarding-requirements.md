# Employee Onboarding + Requirements (Area 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-step employee onboarding wizard with the v3.0 flow (Personal Info, Emergency Contact, Documents, Certifications, Policies, Review), backed by a shared per-employee requirement ledger over three admin-managed catalogs, with requirements assigned at add-employee time.

**Architecture:** A `EmployeeRequirement` ledger (one row per required item) points at three admin catalogs (`DocumentType`, `CertType`, `PolicyDocument`) and at fulfillment records (`EmployeeDocument`, existing `EmployeeCertification`, `EmployeePolicyAck`). Admins pick requirements when creating an employee; the employee fulfills exactly those during resumable, step-by-step onboarding; the same module components resurface in the employee Profile.

**Tech Stack:** Express + Prisma + PostgreSQL (server), React 19 + Vite (admin `client/` and `employee-app/` PWA), Jest + supertest (backend tests), Vitest + Testing Library (frontend tests), Railway bucket via `storageService` for files.

## Global Constraints

- **TDD:** every task writes a failing test first, watches it fail, implements minimally, watches it pass, commits.
- **Design system:** all frontend work uses the app design system (admin `client/src/index.css` tokens; employee-app `employee-app/src/index.css`). Admin create surface follows the two-tier toolbar + Undo/Redo/History/Activity pattern.
- **PHI:** `ssn` is encrypted at rest via `phiCrypto`; `dob` stays a `YYYY-MM-DD` string. Encrypted fields never appear in Prisma `where`/`orderBy`/`@unique`; PHI audit diffs wrapped in `audit.redactChanges`.
- **Storage:** documents go to the Railway bucket via `server/src/lib/storage.js` (`uploadFile(key, buffer, contentType)`, `downloadFile(key)`, `getPresignedUrl(key, expiresIn)`); DB stores only `storageKey`.
- **Audit:** every mutation calls `audit.logAction()`; new entity types (`EmployeeRequirement`, `EmployeeDocument`, `EmployeePolicyAck`, catalog types) added to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx`.
- **File validation (reused everywhere):** allowed mimetypes `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`; max size 10 MB.
- **Prisma:** new tables use `@@map` snake_case; all FKs cascade-delete.
- **Commands:** backend tests `cd server && npx jest <path>`; employee-app tests `cd employee-app && npx vitest run <path>`; admin tests `cd client && npx vitest run <path>`; migrations `cd server && npx prisma migrate dev --name <name>`.

---

## File Structure

**Server (Prisma + Express):**
- `server/prisma/schema.prisma` — add `DocumentType`, `CertType`, `PolicyDocument`, `EmployeeRequirement`, `EmployeeDocument`, `EmployeePolicyAck`; add `Employee` fields.
- `server/prisma/seed-requirements.js` — create-missing-only catalog seeder.
- `server/src/lib/phiCrypto.js` — add `ssn` to `Employee` PHI list.
- `server/src/services/requirementService.js` — assignment + ledger transitions (pure-ish logic, unit-tested).
- `server/src/controllers/catalogController.js` — list/create catalogs (admin).
- `server/src/controllers/employeePortal/onboardingRequirementsController.js` — granular onboarding save handlers (token-auth).
- `server/src/controllers/employeePortal/documentsController.js` — portal documents (employee-auth, reused in Profile).
- `server/src/controllers/employeePortal/policiesController.js` — portal policy acks.
- `server/src/controllers/employeeController.js` — extend `createEmployee` to accept `requirementSelections`.
- `server/src/controllers/onboardingController.js` — extend `getOnboardingInfo` to return ledger + progress; add submit gating.
- `server/src/routes/api.js`, `server/src/routes/employee.js` — wire routes.

**Admin (`client/`):**
- `client/src/components/employees/RequirementSelectionStep.jsx` — catalog multi-select + inline add-new, used in employee-create.
- `client/src/api.js` — catalog + requirement endpoints.
- `client/src/pages/HistoryPage.jsx` — new entity types.

**Employee (`employee-app/`):**
- `employee-app/src/api.js` — granular onboarding + documents/policies endpoints.
- `employee-app/src/pages/OnboardingPage.jsx` — new step sequence.
- `employee-app/src/components/onboarding/PersonalInfoStep.jsx`, `EmergencyContactStep.jsx`, `DocumentsStep.jsx`, `CertificationsStep.jsx`, `PoliciesStep.jsx`, `ReviewStep.jsx` — module components (reused in Profile).
- `employee-app/src/utils/certTypes.js` — retire local list; read from server.

---

### Task 1: Workspace + schema migration for catalogs, ledger, and fulfillment tables

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/lib/phiCrypto.js:6-9`
- Test: `server/__tests__/requirementSchema.test.js`

**Interfaces:**
- Produces: Prisma models `DocumentType`, `CertType`, `PolicyDocument`, `EmployeeRequirement`, `EmployeeDocument`, `EmployeePolicyAck`; `Employee.gender/preferredLanguage/ssn/emergencyContactName/emergencyContactRelationship/emergencyContactPhone/emergencyContactEmail`.

- [ ] **Step 1: Create the worktree for this feature**

Run:
```bash
cd /Users/mac/Documents/antigravity/nvbestpca
git worktree add worktrees/employee-onboarding-reqs -b feat/employee-onboarding-reqs docs/employee-portal-v3-onboarding
cd worktrees/employee-onboarding-reqs
```
Expected: new worktree branched off the approved spec branch (so the design docs are present). All subsequent steps run inside `worktrees/employee-onboarding-reqs`.

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/requirementSchema.test.js`:
```javascript
const prisma = require('../src/lib/prisma');

afterAll(async () => { await prisma.$disconnect(); });

describe('requirement schema', () => {
  let employeeId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Schema Test EE', email: `schema-${Date.now()}@t.co` } });
    employeeId = e.id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('creates a DocumentType and an EmployeeRequirement pointing at it', async () => {
    const dt = await prisma.documentType.create({ data: { key: `govid-${Date.now()}`, label: 'Government ID', requiresExpiry: true, sortOrder: 1 } });
    const req = await prisma.employeeRequirement.create({
      data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required' },
    });
    expect(req.status).toBe('required');
    expect(req.kind).toBe('document');
    await prisma.employeeRequirement.delete({ where: { id: req.id } });
    await prisma.documentType.delete({ where: { id: dt.id } });
  });

  it('stores new Employee personal-info fields', async () => {
    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: { gender: 'F', preferredLanguage: 'English', emergencyContactName: 'Jane' },
    });
    expect(updated.gender).toBe('F');
    expect(updated.emergencyContactName).toBe('Jane');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx jest __tests__/requirementSchema.test.js`
Expected: FAIL — `prisma.documentType` / `prisma.employeeRequirement` undefined, unknown `gender` field.

- [ ] **Step 4: Add models and fields to schema.prisma**

Add to `server/prisma/schema.prisma`:
```prisma
model DocumentType {
  id             Int      @id @default(autoincrement())
  key            String   @unique
  label          String
  requiresExpiry Boolean  @default(false) @map("requires_expiry")
  active         Boolean  @default(true)
  sortOrder      Int      @default(0) @map("sort_order")
  @@map("document_types")
}

model CertType {
  id             Int      @id @default(autoincrement())
  key            String   @unique
  label          String
  renewalYears   Int?     @map("renewal_years")
  requiresExpiry Boolean  @default(true) @map("requires_expiry")
  active         Boolean  @default(true)
  sortOrder      Int      @default(0) @map("sort_order")
  @@map("cert_types")
}

model PolicyDocument {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  title     String
  body      String?
  fileKey   String?  @map("file_key")
  version   Int      @default(1)
  active    Boolean  @default(true)
  sortOrder Int      @default(0) @map("sort_order")
  acks      EmployeePolicyAck[]
  @@map("policy_documents")
}

model EmployeeRequirement {
  id              Int       @id @default(autoincrement())
  employeeId      Int       @map("employee_id")
  kind            String
  catalogTypeId   Int       @map("catalog_type_id")
  status          String    @default("required")
  rejectionReason String    @default("") @map("rejection_reason")
  dueDate         DateTime? @map("due_date")
  documentId      Int?      @map("document_id")
  certificationId Int?      @map("certification_id")
  policyAckId     Int?      @map("policy_ack_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  employee        Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  @@index([employeeId, kind])
  @@map("employee_requirements")
}

model EmployeeDocument {
  id             Int       @id @default(autoincrement())
  employeeId     Int       @map("employee_id")
  documentTypeId Int       @map("document_type_id")
  storageKey     String    @map("storage_key")
  fileName       String    @map("file_name")
  fileType       String    @map("file_type")
  fileSize       Int       @map("file_size")
  expirationDate DateTime? @map("expiration_date")
  status         String    @default("submitted")
  uploadedAt     DateTime  @default(now()) @map("uploaded_at")
  employee       Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  @@index([employeeId])
  @@map("employee_documents")
}

model EmployeePolicyAck {
  id               Int            @id @default(autoincrement())
  employeeId       Int            @map("employee_id")
  policyDocumentId Int            @map("policy_document_id")
  policyVersion    Int            @map("policy_version")
  acknowledgedAt   DateTime       @default(now()) @map("acknowledged_at")
  ipAddress        String?        @map("ip_address")
  employee         Employee       @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  policyDocument   PolicyDocument @relation(fields: [policyDocumentId], references: [id], onDelete: Cascade)
  @@index([employeeId])
  @@map("employee_policy_acks")
}
```

In the `Employee` model, add fields and relations:
```prisma
  gender                       String   @default("") @map("gender")
  preferredLanguage            String   @default("") @map("preferred_language")
  ssn                          String   @default("") @map("ssn")
  emergencyContactName         String   @default("") @map("emergency_contact_name")
  emergencyContactRelationship String   @default("") @map("emergency_contact_relationship")
  emergencyContactPhone        String   @default("") @map("emergency_contact_phone")
  emergencyContactEmail        String   @default("") @map("emergency_contact_email")
  requirements                 EmployeeRequirement[]
  documents                    EmployeeDocument[]
  policyAcks                   EmployeePolicyAck[]
```

- [ ] **Step 5: Add `ssn` to Employee PHI fields**

In `server/src/lib/phiCrypto.js`, change the `Employee` line:
```javascript
    Employee: ['dob', 'notes', 'ssn'],
```

- [ ] **Step 6: Create and apply the migration**

Run: `cd server && npx prisma migrate dev --name employee_requirements_catalogs`
Expected: migration created + applied, Prisma client regenerated.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd server && npx jest __tests__/requirementSchema.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/lib/phiCrypto.js server/__tests__/requirementSchema.test.js
git commit -m "feat(reqs): schema for requirement ledger, catalogs, and employee PHI fields"
```

---

### Task 2: Catalog seeder (create-missing-only)

**Files:**
- Create: `server/prisma/seed-requirements.js`
- Test: `server/__tests__/seedRequirements.test.js`

**Interfaces:**
- Produces: `seedRequirements()` — async, idempotent; seeds the three catalogs; returns `{ documentTypes, certTypes, policyDocuments }` counts created.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/seedRequirements.test.js`:
```javascript
const prisma = require('../src/lib/prisma');
const { seedRequirements, DEFAULT_CERT_TYPES } = require('../prisma/seed-requirements');

afterAll(async () => { await prisma.$disconnect(); });

describe('seedRequirements', () => {
  it('seeds canonical cert types and is idempotent', async () => {
    await seedRequirements();
    const cpr = await prisma.certType.findUnique({ where: { key: 'cpr' } });
    expect(cpr).toBeTruthy();
    expect(cpr.renewalYears).toBe(2);
    const countBefore = await prisma.certType.count();
    await seedRequirements(); // second run creates nothing new
    const countAfter = await prisma.certType.count();
    expect(countAfter).toBe(countBefore);
  });

  it('exposes the canonical cert catalog keys', () => {
    const keys = DEFAULT_CERT_TYPES.map(c => c.key);
    expect(keys).toEqual(['id_expiration', 'tb_test', 'cpr', 'annual_training', 'background_check']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/seedRequirements.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the seeder**

Create `server/prisma/seed-requirements.js`:
```javascript
const prisma = require('../src/lib/prisma');

const DEFAULT_DOCUMENT_TYPES = [
  { key: 'government_id', label: 'Government ID', requiresExpiry: true, sortOrder: 1 },
  { key: 'drivers_license', label: "Driver's License", requiresExpiry: true, sortOrder: 2 },
  { key: 'work_authorization', label: 'Work Authorization', requiresExpiry: true, sortOrder: 3 },
  { key: 'insurance', label: 'Insurance', requiresExpiry: true, sortOrder: 4 },
  { key: 'background_check_doc', label: 'Background Check', requiresExpiry: false, sortOrder: 5 },
];

const DEFAULT_CERT_TYPES = [
  { key: 'id_expiration', label: 'ID Expiration', renewalYears: null, requiresExpiry: true, sortOrder: 1 },
  { key: 'tb_test', label: 'TB Test', renewalYears: 1, requiresExpiry: true, sortOrder: 2 },
  { key: 'cpr', label: 'CPR', renewalYears: 2, requiresExpiry: true, sortOrder: 3 },
  { key: 'annual_training', label: '8hr Annual Training', renewalYears: 1, requiresExpiry: true, sortOrder: 4 },
  { key: 'background_check', label: 'Background Check', renewalYears: 5, requiresExpiry: true, sortOrder: 5 },
];

const DEFAULT_POLICIES = [
  { key: 'employee_handbook', title: 'Employee Handbook', sortOrder: 1 },
  { key: 'hipaa_agreement', title: 'HIPAA Agreement', sortOrder: 2 },
  { key: 'confidentiality_agreement', title: 'Confidentiality Agreement', sortOrder: 3 },
  { key: 'code_of_conduct', title: 'Code of Conduct', sortOrder: 4 },
  { key: 'privacy_policy', title: 'Privacy Policy', sortOrder: 5 },
];

async function createMissing(model, rows) {
  let created = 0;
  for (const row of rows) {
    const existing = await model.findUnique({ where: { key: row.key } });
    if (!existing) { await model.create({ data: row }); created++; }
  }
  return created;
}

async function seedRequirements() {
  const documentTypes = await createMissing(prisma.documentType, DEFAULT_DOCUMENT_TYPES);
  const certTypes = await createMissing(prisma.certType, DEFAULT_CERT_TYPES);
  const policyDocuments = await createMissing(prisma.policyDocument, DEFAULT_POLICIES);
  return { documentTypes, certTypes, policyDocuments };
}

module.exports = { seedRequirements, DEFAULT_DOCUMENT_TYPES, DEFAULT_CERT_TYPES, DEFAULT_POLICIES };

if (require.main === module) {
  seedRequirements().then(r => { console.log('Seeded requirements:', r); return prisma.$disconnect(); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/seedRequirements.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/seed-requirements.js server/__tests__/seedRequirements.test.js
git commit -m "feat(reqs): create-missing-only catalog seeder"
```

---

### Task 3: requirementService — assignment on employee create

**Files:**
- Create: `server/src/services/requirementService.js`
- Test: `server/__tests__/requirementService.test.js`

**Interfaces:**
- Consumes: Prisma models from Task 1.
- Produces:
  - `assignRequirements(tx, employeeId, selections)` where `selections = { documentTypeIds: number[], certTypeIds: number[], policyDocumentIds: number[] }`. Creates one `EmployeeRequirement` per id; for each cert also creates an empty `EmployeeCertification` (matching existing behavior) and links it via `certificationId`. Returns the created requirement rows. `tx` is a Prisma transaction client.
  - `KINDS = { DOCUMENT: 'document', CERTIFICATION: 'certification', POLICY: 'policy' }`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/requirementService.test.js`:
```javascript
const prisma = require('../src/lib/prisma');
const { assignRequirements, KINDS } = require('../src/services/requirementService');

afterAll(async () => { await prisma.$disconnect(); });

describe('assignRequirements', () => {
  let employeeId, dtId, ctId, pdId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Assign EE', email: `assign-${Date.now()}@t.co` } });
    employeeId = e.id;
    dtId = (await prisma.documentType.create({ data: { key: `d-${Date.now()}`, label: 'Doc', sortOrder: 1 } })).id;
    ctId = (await prisma.certType.create({ data: { key: `c-${Date.now()}`, label: 'Cert', renewalYears: 1, sortOrder: 1 } })).id;
    pdId = (await prisma.policyDocument.create({ data: { key: `p-${Date.now()}`, title: 'Policy', sortOrder: 1 } })).id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('creates one requirement per selection and a linked cert slot', async () => {
    const rows = await prisma.$transaction(tx =>
      assignRequirements(tx, employeeId, { documentTypeIds: [dtId], certTypeIds: [ctId], policyDocumentIds: [pdId] })
    );
    expect(rows).toHaveLength(3);
    const certReq = rows.find(r => r.kind === KINDS.CERTIFICATION);
    expect(certReq.certificationId).toBeTruthy();
    const cert = await prisma.employeeCertification.findUnique({ where: { id: certReq.certificationId } });
    expect(cert.employeeId).toBe(employeeId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/requirementService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `server/src/services/requirementService.js`:
```javascript
const KINDS = { DOCUMENT: 'document', CERTIFICATION: 'certification', POLICY: 'policy' };

async function assignRequirements(tx, employeeId, selections = {}) {
  const { documentTypeIds = [], certTypeIds = [], policyDocumentIds = [] } = selections;
  const rows = [];

  for (const catalogTypeId of documentTypeIds) {
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.DOCUMENT, catalogTypeId, status: 'required' },
    }));
  }

  for (const catalogTypeId of certTypeIds) {
    const certType = await tx.certType.findUnique({ where: { id: catalogTypeId } });
    const cert = await tx.employeeCertification.create({
      data: { employeeId, certType: certType ? certType.key : String(catalogTypeId), status: 'required' },
    });
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.CERTIFICATION, catalogTypeId, status: 'required', certificationId: cert.id },
    }));
  }

  for (const catalogTypeId of policyDocumentIds) {
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.POLICY, catalogTypeId, status: 'required' },
    }));
  }

  return rows;
}

module.exports = { assignRequirements, KINDS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/requirementService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/requirementService.js server/__tests__/requirementService.test.js
git commit -m "feat(reqs): assignRequirements creates ledger rows + linked cert slots"
```

---

### Task 4: requirementService — ledger status transitions + completeness gate

**Files:**
- Modify: `server/src/services/requirementService.js`
- Test: `server/__tests__/requirementServiceTransitions.test.js`

**Interfaces:**
- Produces:
  - `markSubmitted(tx, requirementId, fulfillment)` — sets status `submitted`, links `documentId` or `certificationId` from `fulfillment`. Returns updated row.
  - `markPolicyAck(tx, requirementId, policyAckId)` — sets status `approved`, links `policyAckId`. Returns updated row.
  - `isOnboardingComplete(requirements)` — pure: given an array of requirement rows, returns true when every `document`/`certification` is `submitted`|`approved` and every `policy` is `approved`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/requirementServiceTransitions.test.js`:
```javascript
const { isOnboardingComplete } = require('../src/services/requirementService');

describe('isOnboardingComplete', () => {
  it('is false when a required document is not submitted', () => {
    expect(isOnboardingComplete([
      { kind: 'document', status: 'required' },
      { kind: 'policy', status: 'approved' },
    ])).toBe(false);
  });
  it('is true when all docs/certs submitted+ and policies approved', () => {
    expect(isOnboardingComplete([
      { kind: 'document', status: 'submitted' },
      { kind: 'certification', status: 'approved' },
      { kind: 'policy', status: 'approved' },
    ])).toBe(true);
  });
  it('is false when a policy is unacknowledged', () => {
    expect(isOnboardingComplete([{ kind: 'policy', status: 'required' }])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/requirementServiceTransitions.test.js`
Expected: FAIL — `isOnboardingComplete` not exported.

- [ ] **Step 3: Add the functions**

Append to `server/src/services/requirementService.js` (before `module.exports`):
```javascript
async function markSubmitted(tx, requirementId, fulfillment = {}) {
  const data = { status: 'submitted' };
  if (fulfillment.documentId) data.documentId = fulfillment.documentId;
  if (fulfillment.certificationId) data.certificationId = fulfillment.certificationId;
  return tx.employeeRequirement.update({ where: { id: requirementId }, data });
}

async function markPolicyAck(tx, requirementId, policyAckId) {
  return tx.employeeRequirement.update({
    where: { id: requirementId },
    data: { status: 'approved', policyAckId },
  });
}

function isOnboardingComplete(requirements) {
  return requirements.every(r => {
    if (r.kind === 'policy') return r.status === 'approved';
    return r.status === 'submitted' || r.status === 'approved';
  });
}
```
Update `module.exports`:
```javascript
module.exports = { assignRequirements, markSubmitted, markPolicyAck, isOnboardingComplete, KINDS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/requirementServiceTransitions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/requirementService.js server/__tests__/requirementServiceTransitions.test.js
git commit -m "feat(reqs): ledger transitions + onboarding completeness gate"
```

---

### Task 5: Extend createEmployee to assign requirements + audit

**Files:**
- Modify: `server/src/controllers/employeeController.js:32` (`createEmployee`)
- Test: `server/__tests__/createEmployeeRequirements.test.js`

**Interfaces:**
- Consumes: `assignRequirements` (Task 3).
- Produces: `POST /api/employees` accepts optional `requirementSelections: { documentTypeIds, certTypeIds, policyDocumentIds }`; creates ledger rows in the same transaction as the employee; logs `audit.logAction(... action:'CREATE', entityType:'EmployeeRequirement' ...)` with a count in metadata.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/createEmployeeRequirements.test.js`:
```javascript
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { signTestToken } = require('./helpers/auth'); // existing helper pattern; if absent, build token like other controller tests

afterAll(async () => { await prisma.$disconnect(); });

describe('POST /api/employees with requirementSelections', () => {
  let adminToken, dtId, ctId;
  beforeAll(async () => {
    adminToken = await signTestToken({ role: 'admin' });
    dtId = (await prisma.documentType.create({ data: { key: `ced-${Date.now()}`, label: 'Doc', sortOrder: 1 } })).id;
    ctId = (await prisma.certType.create({ data: { key: `cec-${Date.now()}`, label: 'Cert', renewalYears: 1, sortOrder: 1 } })).id;
  });

  it('creates requirement rows for the new employee', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Req EE', email: `reqee-${Date.now()}@t.co`, requirementSelections: { documentTypeIds: [dtId], certTypeIds: [ctId], policyDocumentIds: [] } });
    expect(res.status).toBe(201);
    const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId: res.body.id } });
    expect(reqs).toHaveLength(2);
  });
});
```
NOTE: If `./helpers/auth` does not exist, mirror the token construction used in `server/__tests__/leadController.test.js` (read it first) and place a shared helper at `server/__tests__/helpers/auth.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/createEmployeeRequirements.test.js`
Expected: FAIL — no requirement rows created (0 !== 2).

- [ ] **Step 3: Read the current createEmployee, then implement**

Read `server/src/controllers/employeeController.js:32-120` to match the existing create pattern. Wrap the employee create + `assignRequirements` in a single `prisma.$transaction`. After success, add:
```javascript
const { assignRequirements } = require('../services/requirementService');
// inside createEmployee, replacing the direct prisma.employee.create:
const { requirementSelections, ...employeeData } = req.body;
const result = await prisma.$transaction(async (tx) => {
  const employee = await tx.employee.create({ data: /* existing mapped fields */ });
  let requirements = [];
  if (requirementSelections) {
    requirements = await assignRequirements(tx, employee.id, requirementSelections);
  }
  return { employee, requirements };
});
if (result.requirements.length) {
  audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'EmployeeRequirement', entityId: result.employee.id, entityName: result.employee.name, metadata: { count: result.requirements.length } });
}
```
Preserve all existing employee-field mapping and the existing employee-create audit log.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/createEmployeeRequirements.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/employeeController.js server/__tests__/createEmployeeRequirements.test.js server/__tests__/helpers/auth.js
git commit -m "feat(reqs): assign requirements transactionally on employee create"
```

---

### Task 6: Catalog list + inline-create endpoints (admin)

**Files:**
- Create: `server/src/controllers/catalogController.js`
- Modify: `server/src/routes/api.js`
- Test: `server/__tests__/catalogController.test.js`

**Interfaces:**
- Produces (admin-auth):
  - `GET /api/catalogs/documents` → `{ documentTypes: [...] }` (active only, sorted by `sortOrder`)
  - `GET /api/catalogs/cert-types` → `{ certTypes: [...] }`
  - `GET /api/catalogs/policies` → `{ policyDocuments: [...] }`
  - `POST /api/catalogs/documents|cert-types|policies` → creates one row, returns it.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/catalogController.test.js`:
```javascript
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { signTestToken } = require('./helpers/auth');

afterAll(async () => { await prisma.$disconnect(); });

describe('catalog endpoints', () => {
  let adminToken;
  beforeAll(async () => { adminToken = await signTestToken({ role: 'admin' }); });

  it('lists document types (active, sorted)', async () => {
    const res = await request(app).get('/api/catalogs/documents').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.documentTypes)).toBe(true);
  });

  it('creates a cert type inline', async () => {
    const res = await request(app).post('/api/catalogs/cert-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: `inline-${Date.now()}`, label: 'Inline Cert', renewalYears: 2 });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Inline Cert');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/catalogController.test.js`
Expected: FAIL — 404 (routes not wired).

- [ ] **Step 3: Write the controller**

Create `server/src/controllers/catalogController.js`:
```javascript
const prisma = require('../lib/prisma');
const audit = require('../services/auditService');

const MODELS = {
  documents: { model: () => prisma.documentType, resKey: 'documentTypes', entity: 'DocumentType' },
  'cert-types': { model: () => prisma.certType, resKey: 'certTypes', entity: 'CertType' },
  policies: { model: () => prisma.policyDocument, resKey: 'policyDocuments', entity: 'PolicyDocument' },
};

function list(kind) {
  return async (req, res, next) => {
    try {
      const { model, resKey } = MODELS[kind];
      const rows = await model().findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
      res.json({ [resKey]: rows });
    } catch (err) { next(err); }
  };
}

function create(kind) {
  return async (req, res, next) => {
    try {
      const { model, entity } = MODELS[kind];
      const row = await model().create({ data: req.body });
      audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: entity, entityId: row.id, entityName: row.label || row.title });
      res.status(201).json(row);
    } catch (err) { next(err); }
  };
}

module.exports = {
  listDocuments: list('documents'), createDocument: create('documents'),
  listCertTypes: list('cert-types'), createCertType: create('cert-types'),
  listPolicies: list('policies'), createPolicy: create('policies'),
};
```

- [ ] **Step 4: Wire routes**

In `server/src/routes/api.js`, near the other admin routes:
```javascript
const catalog = require('../controllers/catalogController');
router.get('/catalogs/documents', requireRole('admin', 'user'), catalog.listDocuments);
router.post('/catalogs/documents', requireRole('admin'), catalog.createDocument);
router.get('/catalogs/cert-types', requireRole('admin', 'user'), catalog.listCertTypes);
router.post('/catalogs/cert-types', requireRole('admin'), catalog.createCertType);
router.get('/catalogs/policies', requireRole('admin', 'user'), catalog.listPolicies);
router.post('/catalogs/policies', requireRole('admin'), catalog.createPolicy);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx jest __tests__/catalogController.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/catalogController.js server/src/routes/api.js server/__tests__/catalogController.test.js
git commit -m "feat(reqs): admin catalog list + inline-create endpoints"
```

---

### Task 7: Onboarding info returns ledger + granular personal/emergency save

**Files:**
- Modify: `server/src/controllers/onboardingController.js` (`getOnboardingInfo`)
- Create: `server/src/controllers/employeePortal/onboardingRequirementsController.js`
- Modify: `server/src/routes/api.js`
- Test: `server/__tests__/onboardingRequirements.test.js`

**Interfaces:**
- Consumes: `validateToken` from `onboardingService`, `markSubmitted`/`markPolicyAck` (Task 4).
- Produces (token-auth, public):
  - `GET /api/onboarding/:token` now returns `{ employeeName, employeeEmail, requirements: [{ id, kind, catalogTypeId, label, status, requiresExpiry }], progress: { personal, emergency, availability } }`.
  - `PATCH /api/onboarding/:token/personal` — saves `address, dob, gender, preferredLanguage, ssn`.
  - `PATCH /api/onboarding/:token/emergency` — saves the four emergency-contact fields.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/onboardingRequirements.test.js`:
```javascript
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

describe('onboarding requirements + personal save', () => {
  let token, employeeId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Onb EE', email: `onb-${Date.now()}@t.co`, onboardingStatus: 'invited' } });
    employeeId = e.id;
    token = await onboarding.createOnboardingToken(e.id);
    const dt = await prisma.documentType.create({ data: { key: `onbd-${Date.now()}`, label: 'Gov ID', requiresExpiry: true, sortOrder: 1 } });
    await prisma.employeeRequirement.create({ data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required' } });
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('returns the requirement ledger with labels', async () => {
    const res = await request(app).get(`/api/onboarding/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.requirements[0].label).toBe('Gov ID');
  });

  it('saves personal info including encrypted SSN', async () => {
    const res = await request(app).patch(`/api/onboarding/${token}/personal`)
      .send({ address: '1 St', dob: '1990-01-01', gender: 'F', preferredLanguage: 'English', ssn: '123-45-6789' });
    expect(res.status).toBe(200);
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(ee.ssn).toBe('123-45-6789'); // decrypted transparently by prisma extension
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/onboardingRequirements.test.js`
Expected: FAIL — `requirements` undefined / PATCH 404.

- [ ] **Step 3: Extend getOnboardingInfo**

In `server/src/controllers/onboardingController.js`, after resolving `employee`, load and shape the ledger:
```javascript
const requirements = await buildLedgerView(employee.id);
res.json({ employeeName: employee.name, employeeEmail: employee.email, requirements, progress: {
  personal: Boolean(employee.dob && employee.address),
  emergency: Boolean(employee.emergencyContactName),
  availability: Boolean(employee.availability),
} });
```
Add a helper `buildLedgerView(employeeId)` (in the new controller, imported here) that joins each requirement to its catalog label:
```javascript
async function buildLedgerView(employeeId) {
  const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId } });
  const [docs, certs, policies] = await Promise.all([
    prisma.documentType.findMany(), prisma.certType.findMany(), prisma.policyDocument.findMany(),
  ]);
  const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
  const dMap = byId(docs), cMap = byId(certs), pMap = byId(policies);
  return reqs.map(r => {
    const cat = r.kind === 'document' ? dMap[r.catalogTypeId] : r.kind === 'certification' ? cMap[r.catalogTypeId] : pMap[r.catalogTypeId];
    return { id: r.id, kind: r.kind, catalogTypeId: r.catalogTypeId, status: r.status, label: cat ? (cat.label || cat.title) : '', requiresExpiry: cat ? Boolean(cat.requiresExpiry) : false };
  });
}
```

- [ ] **Step 4: Write the granular save controller**

Create `server/src/controllers/employeePortal/onboardingRequirementsController.js`:
```javascript
const prisma = require('../../lib/prisma');
const onboarding = require('../../services/onboardingService');

async function resolveEmployee(token) {
  const { valid, employee } = await onboarding.validateToken(token);
  if (!valid) return null;
  return employee;
}

async function savePersonal(req, res, next) {
  try {
    const employee = await resolveEmployee(req.params.token);
    if (!employee) return res.status(400).json({ error: 'Invalid link' });
    const { address, dob, gender, preferredLanguage, ssn } = req.body;
    await prisma.employee.update({ where: { id: employee.id }, data: { address, dob, gender, preferredLanguage, ssn } });
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function saveEmergency(req, res, next) {
  try {
    const employee = await resolveEmployee(req.params.token);
    if (!employee) return res.status(400).json({ error: 'Invalid link' });
    const { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } = req.body;
    await prisma.employee.update({ where: { id: employee.id }, data: { emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail } });
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { savePersonal, saveEmergency };
```

- [ ] **Step 5: Wire routes**

In `server/src/routes/api.js`, near the existing onboarding routes:
```javascript
const { savePersonal, saveEmergency } = require('../controllers/employeePortal/onboardingRequirementsController');
router.patch('/onboarding/:token/personal', savePersonal);
router.patch('/onboarding/:token/emergency', saveEmergency);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx jest __tests__/onboardingRequirements.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/onboardingController.js server/src/controllers/employeePortal/onboardingRequirementsController.js server/src/routes/api.js server/__tests__/onboardingRequirements.test.js
git commit -m "feat(reqs): onboarding ledger view + personal/emergency save handlers"
```

---

### Task 8: Onboarding document upload + policy ack + submit gating

**Files:**
- Modify: `server/src/controllers/employeePortal/onboardingRequirementsController.js`
- Modify: `server/src/controllers/onboardingController.js` (`completeOnboarding` → gate on ledger)
- Modify: `server/src/routes/api.js`
- Test: `server/__tests__/onboardingSubmit.test.js`

**Interfaces:**
- Consumes: `storageService.uploadFile`, `markSubmitted`/`markPolicyAck`/`isOnboardingComplete`.
- Produces (token-auth):
  - `POST /api/onboarding/:token/documents/:reqId` (multipart `file`, optional `expirationDate`) — validates file, uploads to bucket, creates `EmployeeDocument`, `markSubmitted`.
  - `POST /api/onboarding/:token/policies/:reqId/ack` — creates `EmployeePolicyAck` (current policy version), `markPolicyAck`.
  - `POST /api/onboarding/:token/submit` — 400 unless `isOnboardingComplete`; else sets `onboardingStatus: 'submitted'` and logs audit SUBMIT.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/onboardingSubmit.test.js`:
```javascript
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const onboarding = require('../src/services/onboardingService');

afterAll(async () => { await prisma.$disconnect(); });

describe('onboarding submit gating', () => {
  let token, employeeId, policyReqId, policyId;
  beforeAll(async () => {
    const e = await prisma.employee.create({ data: { name: 'Sub EE', email: `sub-${Date.now()}@t.co`, onboardingStatus: 'invited' } });
    employeeId = e.id;
    token = await onboarding.createOnboardingToken(e.id);
    const p = await prisma.policyDocument.create({ data: { key: `subp-${Date.now()}`, title: 'Handbook', sortOrder: 1 } });
    policyId = p.id;
    policyReqId = (await prisma.employeeRequirement.create({ data: { employeeId, kind: 'policy', catalogTypeId: p.id, status: 'required' } })).id;
  });
  afterAll(async () => { await prisma.employee.delete({ where: { id: employeeId } }); });

  it('rejects submit while a policy is unacknowledged', async () => {
    const res = await request(app).post(`/api/onboarding/${token}/submit`);
    expect(res.status).toBe(400);
  });

  it('accepts submit after the policy is acknowledged', async () => {
    await request(app).post(`/api/onboarding/${token}/policies/${policyReqId}/ack`).send({});
    const res = await request(app).post(`/api/onboarding/${token}/submit`);
    expect(res.status).toBe(200);
    const ee = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(ee.onboardingStatus).toBe('submitted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/onboardingSubmit.test.js`
Expected: FAIL — ack/submit routes 404.

- [ ] **Step 3: Add upload + ack + submit handlers**

Append to `onboardingRequirementsController.js`:
```javascript
const { uploadFile } = require('../../lib/storage');
const { markSubmitted, markPolicyAck, isOnboardingComplete } = require('../../services/requirementService');

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

async function uploadDocument(req, res, next) {
  try {
    const employee = await resolveEmployee(req.params.token);
    if (!employee) return res.status(400).json({ error: 'Invalid link' });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (!ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ error: 'File type not allowed. Use image or PDF.' });
    if (req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Maximum 10 MB.' });
    const reqId = parseInt(req.params.reqId);
    const requirement = await prisma.employeeRequirement.findFirst({ where: { id: reqId, employeeId: employee.id, kind: 'document' } });
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    const key = `employee-docs/${employee.id}/${requirement.catalogTypeId}/${Date.now()}-${req.file.originalname}`;
    await uploadFile(key, req.file.buffer, req.file.mimetype);
    await prisma.$transaction(async (tx) => {
      const doc = await tx.employeeDocument.create({ data: {
        employeeId: employee.id, documentTypeId: requirement.catalogTypeId, storageKey: key,
        fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size,
        expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
      } });
      await markSubmitted(tx, reqId, { documentId: doc.id });
    });
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function ackPolicy(req, res, next) {
  try {
    const employee = await resolveEmployee(req.params.token);
    if (!employee) return res.status(400).json({ error: 'Invalid link' });
    const reqId = parseInt(req.params.reqId);
    const requirement = await prisma.employeeRequirement.findFirst({ where: { id: reqId, employeeId: employee.id, kind: 'policy' } });
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    const policy = await prisma.policyDocument.findUnique({ where: { id: requirement.catalogTypeId } });
    await prisma.$transaction(async (tx) => {
      const ack = await tx.employeePolicyAck.create({ data: { employeeId: employee.id, policyDocumentId: requirement.catalogTypeId, policyVersion: policy ? policy.version : 1, ipAddress: req.ip } });
      await markPolicyAck(tx, reqId, ack.id);
    });
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { savePersonal, saveEmergency, uploadDocument, ackPolicy };
```

- [ ] **Step 4: Gate submit in completeOnboarding**

In `server/src/controllers/onboardingController.js`, add a `submitOnboarding` handler that checks the ledger (keep the legacy `completeOnboarding` for the old client until Task 12 switches over):
```javascript
const { isOnboardingComplete } = require('../services/requirementService');
async function submitOnboarding(req, res, next) {
  try {
    const { valid, employee } = await onboarding.validateToken(req.params.token);
    if (!valid) return res.status(400).json({ error: 'This onboarding link is no longer valid.' });
    const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId: employee.id } });
    if (!isOnboardingComplete(reqs)) return res.status(400).json({ error: 'Please complete all required items before submitting.' });
    await prisma.employee.update({ where: { id: employee.id }, data: { onboardingStatus: 'submitted' } });
    audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'SUBMIT', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_submitted' } });
    res.json({ success: true });
  } catch (err) { next(err); }
}
module.exports.submitOnboarding = submitOnboarding;
```

- [ ] **Step 5: Wire routes (with multer)**

In `server/src/routes/api.js`:
```javascript
const multer = require('multer');
const onbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const { uploadDocument, ackPolicy } = require('../controllers/employeePortal/onboardingRequirementsController');
const { submitOnboarding } = require('../controllers/onboardingController');
router.post('/onboarding/:token/documents/:reqId', onbUpload.single('file'), uploadDocument);
router.post('/onboarding/:token/policies/:reqId/ack', ackPolicy);
router.post('/onboarding/:token/submit', submitOnboarding);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx jest __tests__/onboardingSubmit.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers server/src/routes/api.js server/__tests__/onboardingSubmit.test.js
git commit -m "feat(reqs): onboarding document upload, policy ack, and ledger-gated submit"
```

---

### Task 9: Portal documents + policies endpoints (reused in Profile)

**Files:**
- Create: `server/src/controllers/employeePortal/documentsController.js`
- Create: `server/src/controllers/employeePortal/policiesController.js`
- Modify: `server/src/routes/employee.js`
- Test: `server/src/controllers/employeePortal/__tests__/documentsController.test.js`

**Interfaces:**
- Consumes: `requireEmployeeLink` (sets `req.employee`), `markSubmitted`/`markPolicyAck`.
- Produces (employee-auth):
  - `GET /api/employee/requirements` → `{ requirements: [ledger view] }`.
  - `GET /api/employee/documents` → `{ documents: [...] }`.
  - `POST /api/employee/documents/:reqId` (multipart) — same validation/flow as onboarding upload but keyed off `req.employee.id`.
  - `POST /api/employee/policies/:reqId/ack`.

- [ ] **Step 1: Write the failing test**

Create `server/src/controllers/employeePortal/__tests__/documentsController.test.js`:
```javascript
const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma');
const { employeeAuthHeader } = require('../../../../__tests__/helpers/auth'); // employee-linked token helper

afterAll(async () => { await prisma.$disconnect(); });

describe('portal requirements', () => {
  it('returns the ledger for the linked employee', async () => {
    const { header, employeeId } = await employeeAuthHeader();
    const dt = await prisma.documentType.create({ data: { key: `pd-${Date.now()}`, label: 'Doc', sortOrder: 1 } });
    await prisma.employeeRequirement.create({ data: { employeeId, kind: 'document', catalogTypeId: dt.id, status: 'required' } });
    const res = await request(app).get('/api/employee/requirements').set(header);
    expect(res.status).toBe(200);
    expect(res.body.requirements.some(r => r.label === 'Doc')).toBe(true);
  });
});
```
NOTE: If `employeeAuthHeader` doesn't exist, build it in `server/__tests__/helpers/auth.js` mirroring how `requireEmployeeLink` resolves an employee (read `server/src/middleware/requireEmployeeLink.js` first).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/controllers/employeePortal/__tests__/documentsController.test.js`
Expected: FAIL — route 404.

- [ ] **Step 3: Write the controllers**

Create `documentsController.js` (mirror the onboarding upload but use `req.employee.id`) with `getRequirements`, `getDocuments`, `uploadDocument`, reusing a shared `buildLedgerView`-style projection (extract the projection into `requirementService` as `projectLedger(employeeId)` and import it in both places to stay DRY). Create `policiesController.js` with `ackPolicy`.

Extract into `requirementService.js`:
```javascript
async function projectLedger(employeeId) {
  const reqs = await require('../lib/prisma').employeeRequirement.findMany({ where: { employeeId } });
  const prisma = require('../lib/prisma');
  const [docs, certs, policies] = await Promise.all([prisma.documentType.findMany(), prisma.certType.findMany(), prisma.policyDocument.findMany()]);
  const byId = (a) => Object.fromEntries(a.map(x => [x.id, x]));
  const d = byId(docs), c = byId(certs), p = byId(policies);
  return reqs.map(r => {
    const cat = r.kind === 'document' ? d[r.catalogTypeId] : r.kind === 'certification' ? c[r.catalogTypeId] : p[r.catalogTypeId];
    return { id: r.id, kind: r.kind, catalogTypeId: r.catalogTypeId, status: r.status, rejectionReason: r.rejectionReason, label: cat ? (cat.label || cat.title) : '', requiresExpiry: cat ? Boolean(cat.requiresExpiry) : false };
  });
}
```
Add `projectLedger` to `module.exports`, and update Task 7's `getOnboardingInfo` to use it (replace the local `buildLedgerView` — a small refactor to keep one projection).

- [ ] **Step 4: Wire routes**

In `server/src/routes/employee.js`:
```javascript
const { getRequirements, getDocuments, uploadDocument } = require('../controllers/employeePortal/documentsController');
const { ackPolicy } = require('../controllers/employeePortal/policiesController');
const portalUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.get('/requirements', getRequirements);
router.get('/documents', getDocuments);
router.post('/documents/:reqId', portalUpload.single('file'), uploadDocument);
router.post('/policies/:reqId/ack', ackPolicy);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx jest src/controllers/employeePortal/__tests__/documentsController.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/employeePortal server/src/services/requirementService.js server/src/controllers/onboardingController.js server/src/routes/employee.js
git commit -m "feat(reqs): portal requirements/documents/policies endpoints + shared ledger projection"
```

---

### Task 10: Admin — RequirementSelectionStep + wire into employee create

**Files:**
- Create: `client/src/components/employees/RequirementSelectionStep.jsx`
- Modify: `client/src/api.js`
- Modify: `client/src/pages/HistoryPage.jsx`
- Modify: the admin employee-create component (locate via `grep -rl createEmployee client/src/pages`)
- Test: `client/src/components/employees/__tests__/RequirementSelectionStep.test.jsx`

**Interfaces:**
- Consumes: `GET /api/catalogs/*`.
- Produces: `<RequirementSelectionStep value onChange />` where `value = { documentTypeIds, certTypeIds, policyDocumentIds }`; renders catalog checklists with standard cert set pre-checked; passes selection up to be sent as `requirementSelections` on create.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/employees/__tests__/RequirementSelectionStep.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import RequirementSelectionStep from '../RequirementSelectionStep';

vi.mock('../../../api', () => ({
  getCatalogDocuments: () => Promise.resolve({ documentTypes: [{ id: 1, label: 'Government ID' }] }),
  getCatalogCertTypes: () => Promise.resolve({ certTypes: [{ id: 2, label: 'CPR', key: 'cpr' }] }),
  getCatalogPolicies: () => Promise.resolve({ policyDocuments: [{ id: 3, title: 'HIPAA' }] }),
}));

it('renders catalog items from all three catalogs', async () => {
  render(<RequirementSelectionStep value={{ documentTypeIds: [], certTypeIds: [], policyDocumentIds: [] }} onChange={() => {}} />);
  await waitFor(() => expect(screen.getByText('Government ID')).toBeInTheDocument());
  expect(screen.getByText('CPR')).toBeInTheDocument();
  expect(screen.getByText('HIPAA')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/employees/__tests__/RequirementSelectionStep.test.jsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Add api functions**

In `client/src/api.js`:
```javascript
export const getCatalogDocuments = () => request('/catalogs/documents');
export const getCatalogCertTypes = () => request('/catalogs/cert-types');
export const getCatalogPolicies = () => request('/catalogs/policies');
```
(Match the existing `request` helper signature in that file.)

- [ ] **Step 4: Build the component (app design system)**

Create `RequirementSelectionStep.jsx` using existing form/checkbox classes from `client/src/index.css`. Fetch the three catalogs on mount, render checklists, call `onChange` with the updated `value`. Pre-check the standard cert set (`cpr`, `tb_test`, `annual_training`, `background_check`) by `key` when first loaded and no prior selection exists.

- [ ] **Step 5: Wire into employee create + send requirementSelections**

In the admin employee-create component, mount `<RequirementSelectionStep>` and include its value as `requirementSelections` in the create payload. Add `'EmployeeRequirement'`, `'EmployeeDocument'`, `'EmployeePolicyAck'` to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/employees/__tests__/RequirementSelectionStep.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src
git commit -m "feat(reqs): admin requirement selection step wired into employee create"
```

---

### Task 11: Employee-app onboarding module components (Personal, Emergency, Documents, Certs, Policies, Review)

**Files:**
- Create: `employee-app/src/components/onboarding/PersonalInfoStep.jsx`, `EmergencyContactStep.jsx`, `DocumentsStep.jsx`, `CertificationsStep.jsx`, `PoliciesStep.jsx`, `ReviewStep.jsx`
- Modify: `employee-app/src/api.js`
- Test: `employee-app/src/components/onboarding/__tests__/DocumentsStep.test.jsx`, `.../ReviewStep.test.jsx`

**Interfaces:**
- Consumes: ledger view items `{ id, kind, catalogTypeId, status, label, requiresExpiry }`.
- Produces: each step component takes `{ requirements, onUpload/onAck/onChange }` props and renders only its kind's items. `ReviewStep` takes the full ledger + personal/emergency data and computes a `complete` boolean (mirrors server `isOnboardingComplete`).

- [ ] **Step 1: Write the failing tests**

Create `employee-app/src/components/onboarding/__tests__/DocumentsStep.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import DocumentsStep from '../DocumentsStep';

it('renders only document requirements', () => {
  const requirements = [
    { id: 1, kind: 'document', label: 'Government ID', status: 'required', requiresExpiry: true },
    { id: 2, kind: 'policy', label: 'HIPAA', status: 'required' },
  ];
  render(<DocumentsStep requirements={requirements} onUpload={() => {}} />);
  expect(screen.getByText('Government ID')).toBeInTheDocument();
  expect(screen.queryByText('HIPAA')).not.toBeInTheDocument();
});
```
Create `.../ReviewStep.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import ReviewStep from '../ReviewStep';

it('blocks submit when a required item is incomplete', () => {
  render(<ReviewStep requirements={[{ id: 1, kind: 'document', label: 'ID', status: 'required' }]} personal={{}} emergency={{}} onSubmit={() => {}} />);
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd employee-app && npx vitest run src/components/onboarding/__tests__/`
Expected: FAIL — components missing.

- [ ] **Step 3: Add api functions**

In `employee-app/src/api.js`:
```javascript
export function saveOnboardingPersonal(token, data) { return fetch(`${BASE}/api/onboarding/${token}/personal`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()); }
export function saveOnboardingEmergency(token, data) { return fetch(`${BASE}/api/onboarding/${token}/emergency`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()); }
export function uploadOnboardingDocument(token, reqId, formData) { return fetch(`${BASE}/api/onboarding/${token}/documents/${reqId}`, { method: 'POST', body: formData }).then(r => r.json()); }
export function ackOnboardingPolicy(token, reqId) { return fetch(`${BASE}/api/onboarding/${token}/policies/${reqId}/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()); }
export function submitOnboardingV2(token) { return fetch(`${BASE}/api/onboarding/${token}/submit`, { method: 'POST' }).then(r => r.json()); }
```

- [ ] **Step 4: Build the six components (employee-app design system)**

Each renders its kind's items using existing `employee-app/src/index.css` classes (`.onboard-*`, `.form-group`, `.btn`). `DocumentsStep`: file input (camera/gallery/PDF via `accept="image/*,application/pdf"` + `capture` attr), optional expiry when `requiresExpiry`. `CertificationsStep`: same upload pattern for cert requirements. `PoliciesStep`: policy title + "I have read and agree" checkbox → `onAck(reqId)`. `ReviewStep`: status chips per requirement + a `complete` gate identical to server rule; Submit disabled until complete.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd employee-app && npx vitest run src/components/onboarding/__tests__/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add employee-app/src
git commit -m "feat(reqs): employee-app onboarding module components + api"
```

---

### Task 12: Rewire OnboardingPage to the new step sequence + resumability

**Files:**
- Modify: `employee-app/src/pages/OnboardingPage.jsx`
- Modify: `employee-app/src/utils/certTypes.js` (retire hardcoded list; read from server ledger)
- Test: `employee-app/src/pages/__tests__/OnboardingPage.test.jsx`

**Interfaces:**
- Consumes: `getOnboardingInfo` (now returns `{ requirements, progress }`), the Task 11 components + api functions.
- Produces: wizard sequence `Password → Personal Info → Emergency Contact → Availability → Documents → Certifications → Policies → Review → Submit`; restores step from `progress` + ledger statuses on load; each step saves on advance.

- [ ] **Step 1: Write the failing test**

Create `employee-app/src/pages/__tests__/OnboardingPage.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import OnboardingPage from '../OnboardingPage';

vi.mock('../../api', () => ({
  getOnboardingInfo: () => Promise.resolve({ employeeName: 'Sarah', requirements: [{ id: 1, kind: 'document', label: 'Government ID', status: 'required', requiresExpiry: true }], progress: { personal: false, emergency: false, availability: false } }),
  saveOnboardingPersonal: vi.fn(() => Promise.resolve({ success: true })),
  saveOnboardingEmergency: vi.fn(() => Promise.resolve({ success: true })),
  uploadOnboardingDocument: vi.fn(), ackOnboardingPolicy: vi.fn(), submitOnboardingV2: vi.fn(),
}));

it('renders the welcome + Password step first', async () => {
  render(<MemoryRouter initialEntries={['/onboard/tok']}><Routes><Route path="/onboard/:token" element={<OnboardingPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/Welcome, Sarah/i)).toBeInTheDocument());
  expect(screen.getByText(/Set Your Password/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd employee-app && npx vitest run src/pages/__tests__/OnboardingPage.test.jsx`
Expected: FAIL (until page rewired; the existing page has no `requirements` handling and may error on the new shape).

- [ ] **Step 3: Rewire the page**

Replace the `STEPS` array and step bodies to the new sequence, keeping the existing Password + Availability step bodies. Insert Personal Info + Emergency Contact after Password; insert Documents/Certifications/Policies (Task 11 components) after Availability; add Review before Submit. On each `handleNext`, call the matching save api. On load, use `progress` + requirement statuses to set the initial `step`. Replace the final `submitOnboarding` call with `submitOnboardingV2`.

- [ ] **Step 4: Retire the hardcoded cert list**

Change `employee-app/src/utils/certTypes.js` to no longer export a hardcoded `CERT_TYPES` used for onboarding; the Certifications step now reads cert requirements from the ledger. Update `CertificationsPage.jsx` import accordingly (it may keep a display fallback, but must not drive onboarding from the local list).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd employee-app && npx vitest run src/pages/__tests__/OnboardingPage.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the full employee-app + server suites**

Run: `cd employee-app && npx vitest run` then `cd ../server && npx jest`
Expected: PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add employee-app/src
git commit -m "feat(reqs): rewire onboarding wizard to v3 step sequence with resumability"
```

---

### Task 13: Surface Documents/Certs/Policies modules in employee Profile

**Files:**
- Modify: `employee-app/src/pages/ProfilePage.jsx`
- Modify: `employee-app/src/api.js`
- Test: `employee-app/src/pages/__tests__/ProfilePage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/employee/requirements`, the Task 11 `DocumentsStep`/`CertificationsStep`/`PoliciesStep` components, portal upload/ack api.
- Produces: Profile page with editable Personal Info + Emergency Contact and Documents/Certifications/Policies sections reading the same ledger.

- [ ] **Step 1: Write the failing test**

Create `employee-app/src/pages/__tests__/ProfilePage.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import ProfilePage from '../ProfilePage';

vi.mock('../../api', () => ({
  api: {
    getProfile: () => Promise.resolve({ phone: '555', address: '1 St', emergencyContactName: 'Jane' }),
    updateProfile: vi.fn(), getRequirements: () => Promise.resolve({ requirements: [{ id: 1, kind: 'document', label: 'Government ID', status: 'approved' }] }),
  },
}));

it('shows the Documents section from the ledger', async () => {
  render(<MemoryRouter><ProfilePage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Government ID')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd employee-app && npx vitest run src/pages/__tests__/ProfilePage.test.jsx`
Expected: FAIL — no ledger section.

- [ ] **Step 3: Add `getRequirements` to portal api + extend Profile**

In `employee-app/src/api.js` add `getRequirements: () => request('/requirements')` (and `uploadDocument`, `ackPolicy` portal variants). In `ProfilePage.jsx`, fetch requirements and render the three module components in read/update mode, plus the expanded Personal Info + Emergency Contact fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd employee-app && npx vitest run src/pages/__tests__/ProfilePage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add employee-app/src
git commit -m "feat(reqs): surface documents/certs/policies + personal info in employee Profile"
```

---

### Task 14: Wire seeder into deploy + final full-suite verification

**Files:**
- Modify: `server/package.json` (add `db:seed-requirements` script + include in start chain if the project seeds on start)
- Modify: `server/prisma/seed.js` or the start script (call `seedRequirements` after admin seed, non-fatal)
- Test: run all suites

**Interfaces:**
- Consumes: `seedRequirements` (Task 2).

- [ ] **Step 1: Add the seed script**

In `server/package.json` scripts:
```json
"db:seed-requirements": "node prisma/seed-requirements.js"
```

- [ ] **Step 2: Call it in the seed chain**

In `server/prisma/seed.js` (or wherever `npm start` seeds), after the admin-user seed, add:
```javascript
try { await require('./seed-requirements').seedRequirements(); } catch (e) { console.error('Requirement seed skipped:', e.message); }
```

- [ ] **Step 3: Run the full backend suite**

Run: `cd server && npx jest`
Expected: PASS (all tasks green, no regressions).

- [ ] **Step 4: Run the full frontend suites**

Run: `cd employee-app && npx vitest run` and `cd ../client && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/prisma/seed.js
git commit -m "chore(reqs): seed requirement catalogs on deploy + full-suite green"
```

---

## Self-Review

**Spec coverage:**
- Three catalogs + ledger + fulfillment records → Tasks 1–4, 9. ✓
- Admin assignment at add-employee time → Tasks 5, 10. ✓
- Inline add-new + catalog list → Task 6, 10. ✓
- Canonical cert catalog (admin), retire employee-app list → Tasks 2, 12. ✓
- Documents to bucket via storageService, storageKey only → Tasks 1, 8, 9. ✓
- SSN PHI encryption → Tasks 1, 7. ✓
- Onboarding steps (Personal, Emergency, Documents, Certs, Policies, Review) → Tasks 7, 8, 11, 12. ✓
- Resumability (granular saves + progress restore) → Tasks 7, 12. ✓
- Submit gating on ledger completeness → Tasks 4, 8, 11. ✓
- Reuse modules in Profile → Task 13. ✓
- Audit + ENTITY_TYPES → Tasks 5, 6, 10. ✓
- Seed on deploy → Task 14. ✓
- Email verification / biometric / catalog-management-UI / review-loop → correctly deferred (not in plan). ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — each step shows code or exact commands. Two NOTE callouts (auth helper, employee-link helper) instruct reading a named existing file first, with the concrete file path — acceptable since the helper shape depends on existing test conventions.

**Type consistency:** `assignRequirements(tx, employeeId, selections)`, `markSubmitted(tx, requirementId, {documentId|certificationId})`, `markPolicyAck(tx, requirementId, policyAckId)`, `isOnboardingComplete(requirements)`, `projectLedger(employeeId)`, `KINDS` — used consistently across Tasks 3–4, 7–9. Ledger view shape `{ id, kind, catalogTypeId, status, label, requiresExpiry }` consistent across server projection (Task 7/9) and frontend consumers (Tasks 11–13). ✓
