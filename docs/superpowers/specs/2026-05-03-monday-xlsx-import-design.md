# Monday.com XLSX Client Import — Design Spec

## Goal

Import client data from Monday.com XLSX exports into the existing PCAlink database, adding new client fields (D.O.B., doctor info, PA#, critical flag) and client notes from the renewal notification history.

## Architecture

Standalone CLI import script (`server/prisma/import-monday-xlsx.js`) that parses both sheets of the Monday.com export. Additive/upsert by client name — existing clients are updated, new clients are created, nothing is deleted. The UI create/edit forms are updated to include the new fields so admins can manage them manually.

## Tech Stack

- `xlsx` library (already in client dependencies; add to server devDependencies)
- Prisma ORM for database operations
- PostgreSQL

---

## 1. Schema Changes

### Client Model — New Fields

| Field | Prisma Type | DB Column | Default | Notes |
|---|---|---|---|---|
| `dob` | `DateTime?` | `dob` | null | Date of birth |
| `paNumber` | `String?` | `pa_number` | `""` | PA# from Monday.com |
| `doctorName` | `String?` | `doctor_name` | `""` | Primary doctor name |
| `doctorPhone` | `String?` | `doctor_phone` | `""` | Primary doctor phone |
| `backupDoctorName` | `String?` | `backup_doctor_name` | `""` | Backup doctor name |
| `backupDoctorPhone` | `String?` | `backup_doctor_phone` | `""` | Backup doctor phone |
| `critical` | `Boolean` | `critical` | `false` | On Monday.com critical list |

### New Model: ClientNote

```prisma
model ClientNote {
  id        Int      @id @default(autoincrement())
  clientId  Int      @map("client_id")
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  date      DateTime
  type      String   @default("") // "60_DAY_RENEWAL", "30_DAY_RENEWAL", "NOTE"
  content   String   @default("")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([clientId])
  @@map("client_notes")
}
```

Add `clientNotes ClientNote[]` relation to the Client model.

---

## 2. Import Script

### File: `server/prisma/import-monday-xlsx.js`

**Usage:** `node prisma/import-monday-xlsx.js <path-to-xlsx>`

### Sheet 1: Client Data

**XLSX Structure (row 2 is the header):**

| Col | Header | Maps To |
|---|---|---|
| A (0) | Name | `clientName` |
| B (1) | Subitems | skip |
| C (2) | D.O.B. | `dob` (parse various date formats) |
| D (3) | CLIENT ID | `medicaidId` |
| E (4) | MCO | `insuranceType` |
| F (5) | START DATE | skip (authorization data — not imported) |
| G (6) | END DATE | skip |
| H (7) | WEEKS | skip |
| I (8) | UNITS | skip |
| J (9) | HOURS | skip |
| K (10) | CLIENT AUTH | skip |
| L (11) | WAIVER UNITS | skip |
| M (12) | PA# | `paNumber` |
| N (13) | Files | skip |
| O (14) | Supervisor Review | skip |
| P (15) | Phone | `phone` |
| Q (16) | Address | `address` |
| R (17) | DOCTOR & BACKUP INFO | parsed → `doctorName`, `doctorPhone`, `backupDoctorName`, `backupDoctorPhone` |
| S (18) | Status | skip (Monday.com board status) |
| T (19) | Notes | `notes` |
| U (20) | Client Schedule | skip |
| V (21) | Mirror | skip |
| W (22) | Item ID | skip |

**Section detection:**
- Row 1 (index 1): "CRITICAL LIST" — rows 3–26 have `critical = true`
- Row 29 (index 29): "ACTIVE CLIENTS AUTHORIZATION" — rows 31+ have `critical = false`
- Skip: row 0 (title), row 2 (header), row 7 ("SAMPLE"), row 27–30 (section dividers/headers), any fully empty row

**No rows skipped** beyond structural rows (title, headers, section labels, empty). Every row with a non-empty Name column is imported.

**Upsert logic:**
1. Normalize client name: `name.trim()`
2. `prisma.client.findFirst({ where: { clientName: { equals: name, mode: 'insensitive' } } })`
3. If found → update with new fields (only overwrite non-empty values from XLSX)
4. If not found → create new client

**D.O.B. parsing:**
The XLSX has inconsistent date formats: `02/26/43`, `08/17/1986`, `4/12/1976`, `01/23/1931`, Excel serial numbers. Use a parser that handles:
- `MM/DD/YY` (2-digit year: 00-29 → 2000s, 30-99 → 1900s — but for D.O.B., always prefer 1900s)
- `MM/DD/YYYY` (4-digit year)
- Excel serial date numbers (e.g., `45678` → convert to JS Date)

**Doctor info parsing:**
The "DOCTOR & BACKUP INFO" column is free-text. Parse strategy:
1. Split by common delimiters: newlines, semicolons, `"backup"` (case-insensitive)
2. First segment → extract doctor name and phone (look for phone pattern: `\d{3}[-.\s]?\d{3}[-.\s]?\d{4}`)
3. Second segment (if exists) → backup doctor name and phone
4. If parsing fails → store entire text in `doctorName`, leave other fields empty

### Sheet 2: Renewal Notification History (Updates)

**XLSX Structure (row 1 is the header):**

| Col | Header | Maps To |
|---|---|---|
| A (0) | Item ID | skip |
| B (1) | Item Name | client name (match to Client) |
| C (2) | Content Type | always "Update" |
| D (3) | Content Type | skip (duplicate) |
| E (4) | User | skip |
| F (5) | Created At | `date` (format: `DD/Month/YYYY HH:MM:SS AM/PM`) |
| G (6) | Update Content | `content` — also parsed for type detection |
| H-K | Likes, Assets, Post ID, Parent Post ID | skip |

**Type detection from content:**
- Contains "60 DAYS PA RENEWAL" → type = `"60_DAY_RENEWAL"`
- Contains "30 DAYS PA RENEWAL" → type = `"30_DAY_RENEWAL"`
- Otherwise → type = `"RENEWAL_NOTICE"`

**Matching:**
- Match "Item Name" to Client by case-insensitive name lookup
- If no matching client found → log warning, still import the row by creating a ClientNote with `clientId` of the closest match or skip with a warning logged to console

**Every row is imported.** No rows skipped. Unmatched rows are logged as warnings in the console output.

---

## 3. API Changes

### POST /api/clients — createClient

Add new fields to accepted body: `dob`, `paNumber`, `doctorName`, `doctorPhone`, `backupDoctorName`, `backupDoctorPhone`, `critical`.

### PUT /api/clients/:id — updateClient

Add same new fields to accepted body and `audit.diffFields` list.

### PATCH /api/clients/:id — patchClient

Add new fields to the optional patch set.

### GET /api/clients/:id — getClient

Include `clientNotes` in the response (ordered by `date` descending).

### GET /api/clients — listClients

No change needed — new fields are returned automatically by Prisma.

---

## 4. UI Changes

### Clients List Page — Create Modal

Add to the existing create modal form:
- D.O.B. (date input)
- PA# (text input)
- Doctor Name (text input)
- Doctor Phone (text input)
- Backup Doctor Name (text input)
- Backup Doctor Phone (text input)
- Critical (checkbox)

### Client Detail Page — Hero Section

Display the new fields in the profile/hero area:
- D.O.B. with age calculation
- PA#
- Doctor info in a sub-section
- Critical badge (red) if `critical === true`

### Client Detail Page — Notes/Timeline

Display `clientNotes` in the existing timeline section, with:
- Date
- Type badge (60-day / 30-day / general)
- Content preview (expandable)

---

## 5. What's NOT Included

- No authorization import from this XLSX (handled by existing master sheet)
- No bulk upload UI (script handles bulk)
- No "updates" sheet for anything other than renewal notifications
- No Monday.com API integration
