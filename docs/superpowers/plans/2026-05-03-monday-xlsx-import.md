# Monday.com XLSX Client Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import client data from Monday.com XLSX exports, adding new fields (D.O.B., doctor info, PA#, critical flag) to the Client model, a new ClientNote model for renewal notifications, and update the UI to display and edit all new fields.

**Architecture:** Prisma migration adds 7 columns to `clients` table and a new `client_notes` table. A standalone CLI import script parses both XLSX sheets. The existing client API controllers and frontend forms are extended to handle the new fields.

**Tech Stack:** Prisma ORM, PostgreSQL, xlsx library, Express.js, React 19

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/prisma/schema.prisma` | Modify | Add new Client fields + ClientNote model |
| `server/prisma/migrations/YYYYMMDD_monday_import/migration.sql` | Create (via prisma) | Generated migration |
| `server/prisma/import-monday-xlsx.js` | Create | CLI script to parse Monday.com XLSX and upsert clients + notes |
| `server/src/controllers/clientController.js` | Modify | Accept new fields in create/update/patch, include clientNotes in getClient |
| `server/src/routes/api.js` | No change | Existing routes cover all needed endpoints |
| `client/src/api.js` | No change | Existing `createClient`, `updateClient`, `patchClient` pass `extra` through |
| `client/src/pages/ClientsListPage.jsx` | Modify | Add new fields to create modal, show critical badge in table |
| `client/src/pages/ClientDetailPage.jsx` | Modify | Display new fields in hero, show client notes in timeline |
| `client/src/index.css` | Modify | Add critical badge styles |
| `server/src/controllers/__tests__/clientController.test.js` | Modify | Add tests for new fields |

---

### Task 1: Prisma Schema — Add Client Fields + ClientNote Model

**Files:**
- Modify: `server/prisma/schema.prisma:88-111`

- [ ] **Step 1: Add new fields to the Client model**

In `server/prisma/schema.prisma`, add these fields to the `Client` model (after the `notes` field, before `enabledServices`):

```prisma
  dob               DateTime? @map("dob")
  paNumber          String    @default("") @map("pa_number")
  doctorName        String    @default("") @map("doctor_name")
  doctorPhone       String    @default("") @map("doctor_phone")
  backupDoctorName  String    @default("") @map("backup_doctor_name")
  backupDoctorPhone String    @default("") @map("backup_doctor_phone")
  critical          Boolean   @default(false) @map("critical")
```

Also add the `clientNotes` relation to the Client model's relation list:

```prisma
  clientNotes     ClientNote[]
```

- [ ] **Step 2: Add the ClientNote model**

Add this new model after the `Client` model block:

```prisma
model ClientNote {
  id        Int      @id @default(autoincrement())
  clientId  Int      @map("client_id")
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  date      DateTime
  type      String   @default("")
  content   String   @default("")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([clientId])
  @@map("client_notes")
}
```

- [ ] **Step 3: Run the migration**

```bash
cd server && npx prisma migrate dev --name monday_import_fields
```

Expected: Migration created and applied successfully. Prisma Client regenerated.

- [ ] **Step 4: Verify the migration**

```bash
cd server && npx prisma db pull --print | grep -A 5 "client_notes"
```

Expected: Shows the `client_notes` table with `id`, `client_id`, `date`, `type`, `content`, `created_at` columns.

- [ ] **Step 5: Commit**

```bash
cd server && git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Client fields (dob, doctor info, PA#, critical) and ClientNote model"
```

---

### Task 2: Update Client Controller — Accept New Fields

**Files:**
- Modify: `server/src/controllers/clientController.js:42-98`

- [ ] **Step 1: Write the failing test**

Add to `server/src/controllers/__tests__/clientController.test.js`:

```javascript
describe('createClient — new fields', () => {
  test('saves dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, critical', async () => {
    const { req, res, next } = mockReqRes({
      body: {
        clientName: 'Test Client',
        dob: '1965-03-15T00:00:00.000Z',
        paNumber: 'PA12345',
        doctorName: 'Dr. Smith',
        doctorPhone: '702-555-1234',
        backupDoctorName: 'Dr. Jones',
        backupDoctorPhone: '702-555-5678',
        critical: true,
      },
    });
    prisma.client.create.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      dob: new Date('1965-03-15'),
      paNumber: 'PA12345',
      doctorName: 'Dr. Smith',
      doctorPhone: '702-555-1234',
      backupDoctorName: 'Dr. Jones',
      backupDoctorPhone: '702-555-5678',
      critical: true,
      authorizations: [],
    });

    await createClient(req, res, next);

    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paNumber: 'PA12345',
          doctorName: 'Dr. Smith',
          doctorPhone: '702-555-1234',
          backupDoctorName: 'Dr. Jones',
          backupDoctorPhone: '702-555-5678',
          critical: true,
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('updateClient — new fields', () => {
  test('saves new fields and includes them in audit diff', async () => {
    const { req, res, next } = mockReqRes({
      params: { id: '1' },
      body: {
        clientName: 'Test Client',
        paNumber: 'PA99999',
        doctorName: 'Dr. New',
        doctorPhone: '702-111-2222',
        backupDoctorName: '',
        backupDoctorPhone: '',
        critical: false,
      },
    });
    prisma.client.findUnique.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      paNumber: 'PA12345',
      doctorName: 'Dr. Old',
      doctorPhone: '702-000-0000',
      backupDoctorName: '',
      backupDoctorPhone: '',
      critical: true,
    });
    prisma.client.update.mockResolvedValue({
      id: 1,
      clientName: 'Test Client',
      paNumber: 'PA99999',
      doctorName: 'Dr. New',
      doctorPhone: '702-111-2222',
      backupDoctorName: '',
      backupDoctorPhone: '',
      critical: false,
      authorizations: [],
    });

    await updateClient(req, res, next);

    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paNumber: 'PA99999',
          doctorName: 'Dr. New',
          critical: false,
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npx jest --testPathPattern=clientController --verbose
```

Expected: New tests FAIL because `createClient` and `updateClient` don't pass the new fields to Prisma.

- [ ] **Step 3: Update createClient to accept new fields**

In `server/src/controllers/clientController.js`, modify the `createClient` function.

Change the destructuring on line 44 from:

```javascript
const { clientName, medicaidId, insuranceType, address, phone, gateCode, notes, enabledServices } = req.body;
```

to:

```javascript
const { clientName, medicaidId, insuranceType, address, phone, gateCode, notes, enabledServices, dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, critical } = req.body;
```

And add the new fields to the `data` object in `prisma.client.create` (after the `enabledServices` line):

```javascript
                dob: dob ? new Date(dob) : null,
                paNumber: (paNumber || '').trim(),
                doctorName: (doctorName || '').trim(),
                doctorPhone: (doctorPhone || '').trim(),
                backupDoctorName: (backupDoctorName || '').trim(),
                backupDoctorPhone: (backupDoctorPhone || '').trim(),
                critical: critical === true,
```

- [ ] **Step 4: Update updateClient to accept new fields**

In the `updateClient` function, change the destructuring on line 72 from:

```javascript
const { clientName, medicaidId, insuranceType, address, phone, gateCode, notes, enabledServices } = req.body;
```

to:

```javascript
const { clientName, medicaidId, insuranceType, address, phone, gateCode, notes, enabledServices, dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, critical } = req.body;
```

Add the new fields to the `data` object in `prisma.client.update`:

```javascript
                dob: dob ? new Date(dob) : null,
                paNumber: (paNumber || '').trim(),
                doctorName: (doctorName || '').trim(),
                doctorPhone: (doctorPhone || '').trim(),
                backupDoctorName: (backupDoctorName || '').trim(),
                backupDoctorPhone: (backupDoctorPhone || '').trim(),
                critical: critical === true,
```

Update the `audit.diffFields` call to include the new fields:

```javascript
const changes = audit.diffFields(oldClient, updated, ['clientName', 'medicaidId', 'insuranceType', 'address', 'phone', 'gateCode', 'notes', 'enabledServices', 'dob', 'paNumber', 'doctorName', 'doctorPhone', 'backupDoctorName', 'backupDoctorPhone', 'critical']);
```

- [ ] **Step 5: Update patchClient to accept new fields**

In `patchClient` (line ~101), add the new fields to the destructuring and the conditional assignment block:

```javascript
const { address, phone, gateCode, notes, enabledServices, dob, paNumber, doctorName, doctorPhone, backupDoctorName, backupDoctorPhone, critical } = req.body;
const data = {};
if (address !== undefined) data.address = address;
if (phone !== undefined) data.phone = phone;
if (gateCode !== undefined) data.gateCode = gateCode;
if (notes !== undefined) data.notes = notes;
if (enabledServices !== undefined) data.enabledServices = enabledServices;
if (dob !== undefined) data.dob = dob ? new Date(dob) : null;
if (paNumber !== undefined) data.paNumber = paNumber;
if (doctorName !== undefined) data.doctorName = doctorName;
if (doctorPhone !== undefined) data.doctorPhone = doctorPhone;
if (backupDoctorName !== undefined) data.backupDoctorName = backupDoctorName;
if (backupDoctorPhone !== undefined) data.backupDoctorPhone = backupDoctorPhone;
if (critical !== undefined) data.critical = critical;
```

- [ ] **Step 6: Update getClient to include clientNotes**

In the `getClient` function, add `clientNotes` to the `include` object:

```javascript
const client = await prisma.client.findUnique({
    where: { id },
    include: {
        authorizations: { orderBy: { createdAt: 'asc' } },
        careTeam: { include: { employee: true }, orderBy: { assignedAt: 'desc' } },
        documents: { include: { uploader: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        hospitalVisits: { orderBy: { visitDate: 'desc' } },
        incidents: { orderBy: { incidentDate: 'desc' } },
        clientNotes: { orderBy: { date: 'desc' } },
    },
});
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd server && npx jest --testPathPattern=clientController --verbose
```

Expected: All tests PASS including the new ones.

- [ ] **Step 8: Commit**

```bash
cd server && git add src/controllers/clientController.js src/controllers/__tests__/clientController.test.js
git commit -m "feat: accept new client fields (dob, doctor info, PA#, critical) in API"
```

---

### Task 3: Import Script — Sheet 1 (Client Data)

**Files:**
- Create: `server/prisma/import-monday-xlsx.js`

- [ ] **Step 1: Create the import script with Sheet 1 parsing**

Create `server/prisma/import-monday-xlsx.js`:

```javascript
/**
 * Import clients from Monday.com XLSX export
 *
 * Sheet 1: Client data with D.O.B., doctor info, PA#, etc.
 * Sheet 2: Renewal notification history → ClientNote records
 *
 * Usage:  node prisma/import-monday-xlsx.js <path-to-xlsx>
 *
 * Behavior: Additive/upsert by client name (case-insensitive).
 *   - Existing clients: updated with non-empty XLSX values
 *   - New clients: created
 *   - No clients or data deleted
 */

const XLSX = require('xlsx');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Helpers ──

function parseDate(val) {
    if (val === undefined || val === null || val === '') return null;
    // XLSX may return a JS Date object
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    // XLSX serial date number (days since 1899-12-30)
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (d) return new Date(d.y, d.m - 1, d.d);
        return null;
    }
    const str = String(val).trim();
    if (!str) return null;
    // Try MM/DD/YY or MM/DD/YYYY
    const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (parts) {
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        let year = parseInt(parts[3], 10);
        // 2-digit year: for D.O.B., always 1900s (nobody in PCA is born after 2000s... except rare cases)
        if (year < 100) {
            year = year <= 29 ? 2000 + year : 1900 + year;
        }
        const d = new Date(year, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
    }
    // Fallback
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function parseDob(val) {
    return parseDate(val);
}

function parseMondayDate(val) {
    // "01/June/2023  06:00:33 PM" format from updates sheet
    if (!val) return null;
    const str = String(val).trim();
    const d = new Date(str.replace(/\s+/g, ' '));
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse "DOCTOR & BACKUP INFO" free-text into structured fields.
 * Strategies:
 *   1. Split by "backup" (case-insensitive)
 *   2. Split by semicolon or newline
 *   3. Extract phone patterns from each segment
 */
function parseDoctorInfo(text) {
    const result = { doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '' };
    if (!text || typeof text !== 'string') return result;

    const cleaned = text.trim();
    if (!cleaned) return result;

    const phonePattern = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;

    // Try splitting by "backup" keyword
    const backupIdx = cleaned.search(/backup/i);
    let primaryPart, backupPart;

    if (backupIdx > 0) {
        primaryPart = cleaned.substring(0, backupIdx).trim();
        backupPart = cleaned.substring(backupIdx).replace(/^backup[:\s]*/i, '').trim();
    } else {
        // Try splitting by semicolon or newline
        const segments = cleaned.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
        primaryPart = segments[0] || '';
        backupPart = segments[1] || '';
    }

    // Extract phone from primary
    const primaryPhones = primaryPart.match(phonePattern);
    if (primaryPhones) {
        result.doctorPhone = primaryPhones[0];
        result.doctorName = primaryPart.replace(phonePattern, '').replace(/[,\s]+$/, '').trim();
    } else {
        result.doctorName = primaryPart;
    }

    // Extract phone from backup
    if (backupPart) {
        const backupPhones = backupPart.match(phonePattern);
        if (backupPhones) {
            result.backupDoctorPhone = backupPhones[0];
            result.backupDoctorName = backupPart.replace(phonePattern, '').replace(/[,\s]+$/, '').trim();
        } else {
            result.backupDoctorName = backupPart;
        }
    }

    return result;
}

// Rows that are section labels, headers, or structural — skip by checking col A content
const SECTION_LABELS = new Set([
    'CLIENT AUTH. ACTIVE/RENEWALS LIST',
    'CRITICAL LIST',
    'ACTIVE CLIENTS AUTHORIZATION',
    'Name',
    'SAMPLE',
]);

function isStructuralRow(row) {
    const colA = String(row[0] || '').trim();
    if (!colA) return true; // empty name → skip
    if (SECTION_LABELS.has(colA)) return true;
    return false;
}

// ── Sheet 1: Client Data ──

async function importClients(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const stats = { created: 0, updated: 0, skipped: 0, errors: [] };

    // Detect critical section: rows between "CRITICAL LIST" header and the blank/section divider
    // Row 1 (index 1) = "CRITICAL LIST", data rows follow until blank row or "ACTIVE CLIENTS" section
    let inCriticalSection = false;
    let criticalNames = new Set();

    for (let i = 0; i < rows.length; i++) {
        const colA = String(rows[i][0] || '').trim();
        if (colA === 'CRITICAL LIST') {
            inCriticalSection = true;
            continue;
        }
        if (colA === 'ACTIVE CLIENTS AUTHORIZATION') {
            inCriticalSection = false;
            continue;
        }
        if (inCriticalSection && colA && !SECTION_LABELS.has(colA)) {
            criticalNames.add(colA.toLowerCase());
        }
    }

    // Now process all data rows
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (isStructuralRow(row)) continue;

        const name = String(row[0] || '').trim();
        if (!name) continue;

        const dob = parseDob(row[2]);
        const medicaidId = String(row[3] || '').trim();
        const insuranceType = String(row[4] || '').trim();
        const paNumber = String(row[12] || '').trim();
        const phone = String(row[15] || '').trim();
        const address = String(row[16] || '').trim();
        const doctorInfo = parseDoctorInfo(row[17]);
        const notes = String(row[19] || '').trim();
        const isCritical = criticalNames.has(name.toLowerCase());

        try {
            // Case-insensitive upsert by name
            const existing = await prisma.client.findFirst({
                where: { clientName: { equals: name, mode: 'insensitive' } },
            });

            const data = {};
            // Only overwrite with non-empty values from XLSX
            if (medicaidId) data.medicaidId = medicaidId;
            if (insuranceType) data.insuranceType = insuranceType;
            if (phone) data.phone = phone;
            if (address) data.address = address;
            if (dob) data.dob = dob;
            if (paNumber) data.paNumber = paNumber;
            if (doctorInfo.doctorName) data.doctorName = doctorInfo.doctorName;
            if (doctorInfo.doctorPhone) data.doctorPhone = doctorInfo.doctorPhone;
            if (doctorInfo.backupDoctorName) data.backupDoctorName = doctorInfo.backupDoctorName;
            if (doctorInfo.backupDoctorPhone) data.backupDoctorPhone = doctorInfo.backupDoctorPhone;
            if (notes) data.notes = notes;
            // Always set critical flag (it's a boolean, not a "non-empty" check)
            data.critical = isCritical;

            if (existing) {
                await prisma.client.update({
                    where: { id: existing.id },
                    data,
                });
                stats.updated++;
                console.log(`  Updated: ${name} (id=${existing.id})`);
            } else {
                data.clientName = name;
                await prisma.client.create({ data });
                stats.created++;
                console.log(`  Created: ${name}`);
            }
        } catch (err) {
            stats.errors.push({ row: i, name, error: err.message });
            console.error(`  ERROR row ${i} (${name}): ${err.message}`);
        }
    }

    return stats;
}

// ── Sheet 2: Renewal Notification History ──

async function importNotes(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const stats = { imported: 0, unmatched: 0, errors: [], unmatchedNames: [] };

    // Row 0 is title, row 1 is header, data starts at row 2
    for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row[1] || '').trim();
        if (!name) continue;

        const dateStr = row[5];
        const content = String(row[6] || '').trim();
        if (!content) continue;

        const date = parseMondayDate(dateStr);
        if (!date) {
            stats.errors.push({ row: i, name, error: `Unparseable date: ${dateStr}` });
            console.error(`  ERROR row ${i} (${name}): Unparseable date: ${dateStr}`);
            continue;
        }

        // Determine type from content
        let type = 'RENEWAL_NOTICE';
        if (content.includes('60 DAYS PA RENEWAL') || content.includes('60 DAYS PA RENEWAL')) {
            type = '60_DAY_RENEWAL';
        } else if (content.includes('30 DAYS PA RENEWAL') || content.includes('30 DAYS PA RENEWAL')) {
            type = '30_DAY_RENEWAL';
        }

        try {
            const client = await prisma.client.findFirst({
                where: { clientName: { equals: name, mode: 'insensitive' } },
            });

            if (!client) {
                stats.unmatched++;
                if (!stats.unmatchedNames.includes(name)) stats.unmatchedNames.push(name);
                console.warn(`  WARN row ${i}: No client match for "${name}"`);
                continue;
            }

            await prisma.clientNote.create({
                data: {
                    clientId: client.id,
                    date,
                    type,
                    content,
                },
            });
            stats.imported++;
        } catch (err) {
            stats.errors.push({ row: i, name, error: err.message });
            console.error(`  ERROR row ${i} (${name}): ${err.message}`);
        }
    }

    return stats;
}

// ── Main ──

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node prisma/import-monday-xlsx.js <path-to-xlsx>');
        process.exit(1);
    }

    const resolved = path.resolve(filePath);
    console.log(`\nReading: ${resolved}\n`);

    const wb = XLSX.readFile(resolved);
    console.log(`Sheets: ${wb.SheetNames.join(', ')}\n`);

    // Sheet 1: Client data
    const clientSheet = wb.Sheets[wb.SheetNames[0]];
    console.log('=== Importing Clients (Sheet 1) ===');
    const clientStats = await importClients(clientSheet);
    console.log(`\nClients: ${clientStats.created} created, ${clientStats.updated} updated, ${clientStats.errors.length} errors\n`);

    // Sheet 2: Renewal notes (if exists)
    if (wb.SheetNames.length > 1) {
        const notesSheet = wb.Sheets[wb.SheetNames[1]];
        console.log('=== Importing Renewal Notes (Sheet 2) ===');
        const noteStats = await importNotes(notesSheet);
        console.log(`\nNotes: ${noteStats.imported} imported, ${noteStats.unmatched} unmatched, ${noteStats.errors.length} errors`);
        if (noteStats.unmatchedNames.length > 0) {
            console.log(`Unmatched client names: ${noteStats.unmatchedNames.join(', ')}`);
        }
    }

    console.log('\nDone!');
}

main()
    .catch((err) => { console.error('Fatal:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add xlsx as a server devDependency**

```bash
cd server && npm install --save-dev xlsx
```

- [ ] **Step 3: Test the script with the real XLSX (dry check — verify it runs)**

```bash
cd server && node prisma/import-monday-xlsx.js /Users/mac/Downloads/CLIENT_AUTH_ACTIVE_RENEWALS_LIST_1777762578.xlsx
```

Expected: Output showing "Created:" or "Updated:" for each client, then notes import summary. No fatal errors.

- [ ] **Step 4: Commit**

```bash
cd server && git add prisma/import-monday-xlsx.js package.json package-lock.json
git commit -m "feat: add Monday.com XLSX client import script (both sheets)"
```

---

### Task 4: UI — Add New Fields to Create Client Modal

**Files:**
- Modify: `client/src/pages/ClientsListPage.jsx:17,46-51,140-163`

- [ ] **Step 1: Expand the form state**

In `ClientsListPage.jsx`, change the initial `form` state (line 17) from:

```javascript
const [form, setForm] = useState({ clientName: '', medicaidId: '', insuranceType: 'MEDICAID', address: '', phone: '' });
```

to:

```javascript
const [form, setForm] = useState({
    clientName: '', medicaidId: '', insuranceType: 'MEDICAID', address: '', phone: '',
    dob: '', paNumber: '', doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '', critical: false,
});
```

- [ ] **Step 2: Pass new fields in handleCreate**

In the `handleCreate` function, change the `extra` object passed to `api.createClient` from:

```javascript
const client = await api.createClient(form.clientName, {
    medicaidId: form.medicaidId,
    insuranceType: form.insuranceType,
    address: form.address,
    phone: form.phone,
});
```

to:

```javascript
const client = await api.createClient(form.clientName, {
    medicaidId: form.medicaidId,
    insuranceType: form.insuranceType,
    address: form.address,
    phone: form.phone,
    dob: form.dob || null,
    paNumber: form.paNumber,
    doctorName: form.doctorName,
    doctorPhone: form.doctorPhone,
    backupDoctorName: form.backupDoctorName,
    backupDoctorPhone: form.backupDoctorPhone,
    critical: form.critical,
});
```

Also update the form reset on line 54:

```javascript
setForm({
    clientName: '', medicaidId: '', insuranceType: 'MEDICAID', address: '', phone: '',
    dob: '', paNumber: '', doctorName: '', doctorPhone: '', backupDoctorName: '', backupDoctorPhone: '', critical: false,
});
```

- [ ] **Step 3: Add critical badge to the clients table**

In the table body, update the client name cell (around line 114) from:

```jsx
<td style={{ fontWeight: 500 }}>{c.clientName}</td>
```

to:

```jsx
<td style={{ fontWeight: 500 }}>
    {c.clientName}
    {c.critical && <span className="ts-badge ts-badge--critical" style={{ marginLeft: 6 }}>Critical</span>}
</td>
```

- [ ] **Step 4: Add new fields to the create modal form**

After the existing Address form group (line ~163), add these form groups before the closing `</form>`:

```jsx
<div className="form-group">
    <label>Date of Birth</label>
    <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
</div>
<div className="form-group">
    <label>PA#</label>
    <input type="text" value={form.paNumber} onChange={(e) => setForm({ ...form, paNumber: e.target.value })} placeholder="Optional" />
</div>
<div className="form-group">
    <label>Doctor Name</label>
    <input type="text" value={form.doctorName} onChange={(e) => setForm({ ...form, doctorName: e.target.value })} placeholder="Optional" />
</div>
<div className="form-group">
    <label>Doctor Phone</label>
    <input type="text" value={form.doctorPhone} onChange={(e) => setForm({ ...form, doctorPhone: e.target.value })} placeholder="Optional" />
</div>
<div className="form-group">
    <label>Backup Doctor Name</label>
    <input type="text" value={form.backupDoctorName} onChange={(e) => setForm({ ...form, backupDoctorName: e.target.value })} placeholder="Optional" />
</div>
<div className="form-group">
    <label>Backup Doctor Phone</label>
    <input type="text" value={form.backupDoctorPhone} onChange={(e) => setForm({ ...form, backupDoctorPhone: e.target.value })} placeholder="Optional" />
</div>
<div className="form-group">
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={form.critical} onChange={(e) => setForm({ ...form, critical: e.target.checked })} />
        Critical List
    </label>
</div>
```

- [ ] **Step 5: Commit**

```bash
cd client && git add src/pages/ClientsListPage.jsx
git commit -m "feat: add new client fields to create modal (dob, doctor, PA#, critical)"
```

---

### Task 5: UI — Display New Fields on Client Detail Page

**Files:**
- Modify: `client/src/pages/ClientDetailPage.jsx:330-437`

- [ ] **Step 1: Add critical badge to the hero name**

In `ClientDetailPage.jsx`, find the hero name element (around line 336):

```jsx
<h2 className="cp-hero__name">{client.clientName}</h2>
```

Change to:

```jsx
<h2 className="cp-hero__name">
    {client.clientName}
    {client.critical && <span className="ts-badge ts-badge--critical" style={{ marginLeft: 8 }}>Critical</span>}
</h2>
```

- [ ] **Step 2: Add D.O.B., PA#, and doctor info fields to the hero profile**

In the hero fields area (inside `.cp-hero__fields`, after the address field around line 362), add:

```jsx
{client.dob && (
    <div className="cp-hero__field">
        <span className="cp-hero__field-label">D.O.B.</span>
        <span className="cp-hero__field-value">
            {new Date(client.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' '}({Math.floor((Date.now() - new Date(client.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs)
        </span>
    </div>
)}
{client.paNumber && (
    <div className="cp-hero__field">
        <span className="cp-hero__field-label">PA#</span>
        <span className="cp-hero__field-value">{client.paNumber}</span>
    </div>
)}
{client.doctorName && (
    <div className="cp-hero__field">
        <span className="cp-hero__field-label">Doctor</span>
        <span className="cp-hero__field-value">
            {client.doctorName}{client.doctorPhone ? ` \u2022 ${client.doctorPhone}` : ''}
        </span>
    </div>
)}
{client.backupDoctorName && (
    <div className="cp-hero__field">
        <span className="cp-hero__field-label">Backup Doctor</span>
        <span className="cp-hero__field-value">
            {client.backupDoctorName}{client.backupDoctorPhone ? ` \u2022 ${client.backupDoctorPhone}` : ''}
        </span>
    </div>
)}
```

- [ ] **Step 3: Add Client Notes / Renewal History section**

After the incidents section in the right column (or wherever the timeline lives), add a new card for client notes. Find the end of the incidents card section and add:

```jsx
{/* Client Notes / Renewal History */}
<div className="cp-card cp-card--elevated">
    <div className="cp-card__header">
        <h3 className="cp-card__title">
            <span className="cp-card__dot" style={{ background: '#8b5cf6' }} />
            Renewal History
        </h3>
        <span className="cp-card__count">{(client.clientNotes || []).length}</span>
    </div>
    {(!client.clientNotes || client.clientNotes.length === 0) ? (
        <div className="cp-empty-card">
            <div className="cp-empty-card__icon">{Icons.fileText}</div>
            <div className="cp-empty-card__text">No renewal history</div>
        </div>
    ) : (
        <div className="cp-timeline">
            {client.clientNotes.map(note => (
                <div key={note.id} className="cp-visit-entry">
                    <div className="cp-visit-entry__track">
                        <div className="cp-timeline-dot" style={{ '--dot-color': note.type === '60_DAY_RENEWAL' ? '#f59e0b' : note.type === '30_DAY_RENEWAL' ? '#ef4444' : '#8b5cf6' }} />
                        <div className="cp-timeline-line" />
                    </div>
                    <div className="cp-visit-entry__content">
                        <div className="cp-visit-entry__header">
                            <span className={`ts-badge ${note.type === '60_DAY_RENEWAL' ? 'ts-badge--draft' : note.type === '30_DAY_RENEWAL' ? 'ts-badge--submitted' : 'ts-badge--upcoming'}`}>
                                {note.type === '60_DAY_RENEWAL' ? '60-Day Notice' : note.type === '30_DAY_RENEWAL' ? '30-Day Notice' : 'Renewal Notice'}
                            </span>
                            <span className="cp-visit-entry__date">{formatDate(note.date)}</span>
                        </div>
                        <div className="cp-visit-entry__details" style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                            {note.content.substring(0, 200)}{note.content.length > 200 ? '...' : ''}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )}
</div>
```

- [ ] **Step 4: Commit**

```bash
cd client && git add src/pages/ClientDetailPage.jsx
git commit -m "feat: display new client fields + renewal history on care plan detail"
```

---

### Task 6: CSS — Critical Badge Style

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add the critical badge CSS**

Find the existing `.ts-badge` styles in `client/src/index.css` and add after the last badge variant:

```css
.ts-badge--critical {
    background: hsl(0 84% 95%);
    color: hsl(0 84% 40%);
    border: 1px solid hsl(0 84% 85%);
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
```

- [ ] **Step 2: Commit**

```bash
cd client && git add src/index.css
git commit -m "style: add critical badge CSS variant"
```

---

### Task 7: Manual Verification

- [ ] **Step 1: Build and test end-to-end**

```bash
cd client && npm run build
```

- [ ] **Step 2: Start the server and verify**

```bash
cd server && npm run dev
```

Open `http://localhost:4000` and verify:
1. Navigate to Clients → "Add Client" modal shows the new fields (D.O.B., PA#, Doctor fields, Critical checkbox)
2. Create a test client with all fields filled → verify it saves
3. Open the test client → hero shows D.O.B. with age, PA#, doctor info, critical badge
4. If import has been run: verify renewal history section shows notes

- [ ] **Step 3: Run the import script**

```bash
cd server && node prisma/import-monday-xlsx.js /Users/mac/Downloads/CLIENT_AUTH_ACTIVE_RENEWALS_LIST_1777762578.xlsx
```

Expected: Summary showing clients created/updated and notes imported.

- [ ] **Step 4: Verify imported data in the UI**

Reload the clients list → check that imported clients appear with correct data and critical badges. Open a client detail page → verify D.O.B., doctor info, and renewal history timeline.

- [ ] **Step 5: Run all tests**

```bash
cd server && npm test
```

Expected: All tests pass.
