# Area 1 — Onboarding + Requirements (Documents / Certifications / Policies)

**Date:** 2026-08-04
**Status:** Approved design (brainstorming)
**Roadmap:** `2026-08-04-employee-portal-v3-roadmap.md`
**Applies to:** `employee-app/` (PWA), `client/` (admin), `server/` (Express + Prisma)

## Goal

Replace the current 4-step onboarding wizard (`Password → Schedule → Travel → Time Off`) with the v3.0 flow, backed by a **shared requirement ledger** over three **admin-managed catalogs**. Admins choose an employee's required Documents, Certifications, and Policies **at add-employee time**; the employee fulfills exactly those items during onboarding; the same module components resurface in the employee **Profile** for ongoing upkeep.

### In scope

- Onboarding steps added: **Personal Info**, **Emergency Contact**, **Documents**, **Certifications**, **Policies**, **Review**.
- Three admin catalogs (Documents, Certifications, Policies) + a per-employee requirement ledger.
- Per-employee requirement assignment during admin employee-create.
- Resumable, step-by-step onboarding persistence.
- Reuse of the Documents/Certs/Policies module components in the employee Profile.

### Out of scope (later areas)

- "Changes Requested" review loop + per-item rejection UX → **Area 2**.
- 7-state lifecycle machine + status-based feature gating → **Area 2**.
- Full catalog management UI (edit/reorder/deactivate) → **Area 4**.
- Email verification, biometric login → **Area 4**.

## Decisions captured during brainstorming

| Question | Decision |
|---|---|
| Visit clock-in/out | Owned by **Sandata EVV**, not this area. |
| Open-shift job board | Mockup mistake — not built. |
| Document storage | **Railway bucket** via `storageService`; DB stores `storageKey`. |
| Requirement configurability | **Fully admin-configurable, chosen at add-employee time.** |
| Requirement source | **Managed catalog** the admin picks from. |
| Cert catalog source of truth | **Admin catalog is canonical** (`id_expiration, tb_test, cpr, annual_training, background_check`), admin-extensible; employee-app's looser list retired. |
| Onboarding steps this area | Personal Info + Emergency Contact + Documents + Certs + Policies + Review. Email verify deferred. |
| Data model | **Shared requirement ledger + catalogs (Approach A).** |

## Data model

### Catalogs (admin-managed reference tables, admin-extensible)

**`DocumentType`**
`id, key (unique), label, requiresExpiry Boolean, active Boolean @default(true), sortOrder Int`
Seed: Government ID, Driver's License, Work Authorization, Insurance, Background Check.

**`CertType`** — the single, canonical certification catalog
`id, key (unique), label, renewalYears Int?, requiresExpiry Boolean, active Boolean @default(true), sortOrder Int`
Seed from the admin canonical set: `id_expiration` (no renewal), `tb_test` (1yr), `cpr` (2yr), `annual_training` (1yr), `background_check` (5yr).
The employee-app's ad-hoc `CERT_TYPES` list (`Cultural Competency`, `Infection Control`, `ID`, `Other`, …) is **retired**; the employee-app reads `CertType` instead.

**`PolicyDocument`**
`id, key (unique), title, body String?, fileKey String?, version Int @default(1), active Boolean @default(true), sortOrder Int`
Seed: Employee Handbook, HIPAA Agreement, Confidentiality Agreement, Code of Conduct, Privacy Policy.
`version` bumps when the policy text changes so acknowledgements are version-bound.

Catalogs are seeded via `server/prisma/seed-requirements.js` (create-missing-only, mirroring `seed-services.js` — never overwrites existing rows).

### Ledger — `EmployeeRequirement` (one row per required item per employee)

```
id             Int      @id @default(autoincrement())
employeeId     Int
kind           String   // 'document' | 'certification' | 'policy'
catalogTypeId  Int      // FK by kind into DocumentType / CertType / PolicyDocument
status         String   @default("required") // required | submitted | approved | rejected
rejectionReason String  @default("")         // populated in Area 2
dueDate        DateTime?
documentId     Int?     // → EmployeeDocument (kind = document)
certificationId Int?    // → EmployeeCertification (kind = certification)
policyAckId    Int?     // → EmployeePolicyAck (kind = policy)
createdAt / updatedAt
@@index([employeeId, kind])
```

The ledger is the single source of truth for "what does this employee still owe." Onboarding, the Review screen, Home "Pending Actions," and (Area 2) agency review all read it.

### Fulfillment records

**`EmployeeDocument`** (net-new)
`id, employeeId, documentTypeId, storageKey, fileName, fileType, fileSize, expirationDate DateTime?, status String @default("submitted"), uploadedAt`
Stored in the Railway bucket via `storageService`; only `storageKey` persists in the DB.

**Certifications** reuse the **existing** `EmployeeCertification` + `CertificationUpload` tables and upload flow. The ledger row (`kind='certification'`) points at the cert via `certificationId`. No new cert table.

**`EmployeePolicyAck`** (net-new)
`id, employeeId, policyDocumentId, policyVersion Int, acknowledgedAt, ipAddress String?`
Written when the employee checks "I have read and agree." Acks require no agency review → the ledger row goes straight to `approved`.

### Employee fields

- **Personal Info:** `address` (exists), `dob` (exists, `YYYY-MM-DD` string), plus new `gender`, `preferredLanguage`, `ssn`.
- **`ssn`** added to `PHI_FIELDS` in `server/src/lib/phiCrypto.js` (AES-256-GCM at rest). Never in `where`/`orderBy`/`@unique`; audit diffs wrapped in `audit.redactChanges`.
- **Emergency Contact:** new `emergencyContactName, emergencyContactRelationship, emergencyContactPhone, emergencyContactEmail` (replaces today's single free-text `emergencyContact`; migrate existing value into `emergencyContactName`).

All FKs cascade-delete, consistent with the schema. New tables use `@@map` snake_case.

## Admin side (`client/` + `server`)

### Catalog seeding & minimal management

- `seed-requirements.js` seeds the three catalogs (create-missing-only).
- **Area 1 management is minimal:** catalogs are admin-*extensible* via an **inline "add new type"** affordance inside the assignment step (so a one-off type never blocks an admin). Edit / reorder / deactivate is **Area 4**.
- Read endpoints: `GET /api/catalogs/documents`, `GET /api/catalogs/cert-types`, `GET /api/catalogs/policies` (admin-auth). Inline create: `POST /api/catalogs/documents|cert-types|policies`.

### Add-employee flow

Extends the existing admin employee-create path (`employeeController.createEmployee` + the `client/` create UI). After the current required fields, add an **"Onboarding Requirements"** step:

- Multi-select from each catalog which Documents, Certifications, Policies this employee must complete.
- **Sensible defaults pre-checked** (the standard cert set) so the common case is one click.
- Inline "add new type" available per catalog.

On save (transactional):
1. Create the `Employee` with `onboardingStatus: 'invited'` (unchanged).
2. Create one `EmployeeRequirement` row per selected catalog item.
3. For selected certs, create the empty `EmployeeCertification` slots (matches today's behavior) and link them.
4. Send the invite email (unchanged).

### Admin conventions

- Follows the two-tier toolbar + Undo/Redo/History/Activity pattern for the create surface.
- Audit: assignment logs `CREATE` on `EmployeeRequirement`. New entity types `EmployeeRequirement`, `EmployeeDocument`, `EmployeePolicyAck` added to `ENTITY_TYPES` in `client/src/pages/HistoryPage.jsx`.

## Employee onboarding flow (`employee-app/`)

`OnboardingPage.jsx` step sequence:

`Password → Personal Info → Emergency Contact → Availability → Documents → Certifications → Policies → Review → Submit`

- **Password** — unchanged (min 8, show/hide). Biometric opt-in deferred (Area 4).
- **Personal Info** — Address, DOB (`YYYY-MM-DD`), Gender, Preferred Language, SSN (HTTPS in transit, `phiCrypto` at rest).
- **Emergency Contact** — Name, Relationship, Phone, Email → the new Employee fields.
- **Availability** — the existing rich step (weekly days/hours, max hours, travel, transportation, holidays, blackout dates, initial time off) — **kept as-is**.
- **Documents / Certifications / Policies** — each renders **only the items in this employee's `EmployeeRequirement` ledger**, not a fixed list:
  - *Documents:* per required `DocumentType`, upload (camera / gallery / PDF → bucket), capture expiry when `requiresExpiry`. Requirement → `submitted`.
  - *Certifications:* reuse the existing cert upload flow, driven by required `CertType`s. Requirement → `submitted`.
  - *Policies:* render each required `PolicyDocument`; "I have read and agree" writes `EmployeePolicyAck` (version + timestamp). Requirement → `approved`.
- **Review** — read-only summary with per-requirement status chips; **blocks Submit** until every required document/cert is at least `submitted` and every policy acknowledged.
- **Submit** → `onboardingStatus: 'submitted'` (Area 2 renames/expands the states).

### Resumability

Each step persists on completion through granular endpoints (below), not one final POST. `GET /onboarding/:token` returns the requirement ledger **plus** any saved progress so the wizard restores server state on load. The ledger drives a completion indicator ("3 of 7 requirements done").

## Reuse in Profile

The Documents, Certifications, and Policies steps are built as **standalone module components** (not wizard-only) and also mounted in the employee **Profile** (Documents / Certifications / Policies sections), reading the same ledger. This satisfies the spec's "keep documents, certifications, and availability up to date" with no second implementation. Profile also expands to edit Personal Info + Emergency Contact.

## API surface

**Onboarding (token-auth, public, resumable)**
- `GET  /api/onboarding/:token` → employee info + requirement ledger + saved progress
- `PATCH /api/onboarding/:token/personal`
- `PATCH /api/onboarding/:token/emergency`
- `PATCH /api/onboarding/:token/availability`
- `POST /api/onboarding/:token/documents/:reqId` (multipart file)
- `POST /api/onboarding/:token/certifications/:reqId` (multipart file)
- `POST /api/onboarding/:token/policies/:reqId/ack`
- `POST /api/onboarding/:token/submit`

**Portal (employee-auth, reused in Profile)**
- `GET  /api/employee/requirements`
- `GET  /api/employee/documents`
- `POST /api/employee/documents/:reqId` (multipart file)
- `POST /api/employee/policies/:reqId/ack`
- Existing `/api/employee/certifications*` reused.

**Admin**
- `GET  /api/catalogs/(documents|cert-types|policies)`
- `POST /api/catalogs/(documents|cert-types|policies)` (inline add-new)
- `POST /api/employees` extended to accept `requirementSelections`.

## Error handling

- File validation reuses the cert controller rules: allowed `image/jpeg|png|heic|webp` + `application/pdf`; max 10 MB. Invalid → 400 with a clear message.
- Partial-save failures leave the ledger unchanged and surface a step-level error (no cross-step corruption).
- `Submit` is transactional over the status flips; if any required item is incomplete it returns 400 and the Review screen highlights the gaps.
- Token invalid / expired / already-completed → the existing friendly messages in `onboardingController`.

## Testing (TDD)

**Backend (Jest)**
- Requirement rows created correctly on employee-create from `requirementSelections`.
- Empty `EmployeeCertification` slots created + linked for selected certs.
- Each granular save handler updates the right ledger row + fulfillment record and transitions status.
- Policy ack records the current `PolicyDocument.version` at acknowledgement time. In Area 1 the ack is immutable history and the requirement is satisfied regardless of later version bumps; re-acknowledgement-on-new-version is explicitly Area 2/4 behavior and not implemented here.
- SSN PHI encryption round-trips (write encrypted, read decrypted, absent from `where`).
- `Submit` rejects when any required document/cert is not `submitted`+ or any policy unacknowledged.

**Frontend (Vitest)**
- Wizard step gating/validation (can't advance past an invalid step).
- Documents/Certs/Policies steps render **only** ledger-assigned items.
- Resumability: given saved progress, the wizard restores to the right step/state.
- Review completeness gate enables Submit only when the ledger is satisfied.
- Uses the app design system per standing user feedback.

## Migration notes

- New Prisma migration for `DocumentType`, `CertType`, `PolicyDocument`, `EmployeeRequirement`, `EmployeeDocument`, `EmployeePolicyAck`, and the new `Employee` fields (`gender`, `preferredLanguage`, `ssn`, emergency-contact fields).
- Data migration: copy any existing `Employee.emergencyContact` free-text into `emergencyContactName`.
- `seed-requirements.js` run on deploy (idempotent).
- Employee-app aligns its cert list to `CertType` (retire local `CERT_TYPES` constant).
