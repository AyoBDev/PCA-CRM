# Timesheet Single-Link Redesign

## Summary

Replace the current two-link signing system (separate PCA and client links) with a single link sent to the PCA. The PCA fills in activities, times, and their initials/signature, then hands the device to the client for daily initials and final signature. Submit is gated on completeness. Admin gets an export button that generates a PDF matching the standard Nevada PCA timesheet form.

## Current State

- Admin creates a timesheet (client, PCA name, week start)
- Admin generates two signing links: one for PCA, one for client
- PCA link: PCA fills in times, PCA initials, PCA signature
- Client link: client fills in client initials, client signature
- Two separate SigningToken records (role: `"pca"` and `"client"`)
- No PDF export exists

## New Flow

1. Admin creates timesheet (unchanged)
2. Admin generates **one** signing link, copies it, sends to PCA
3. PCA opens the link (public, no auth) and sees a single weekly form
4. PCA fills in their sections, then hands device to client
5. Client fills in their sections
6. Submit — both PCA and client data saved in one request
7. Admin can export any timesheet as a PDF

## Signing Form Layout

The form accessed via the single link contains the following sections in order:

### Header
- Client name, PCA name, week dates (read-only)

### Daily Entries (7 day cards, Sun–Sat)

Each day card contains:

- **ADL Section**
  - Activity checkboxes (Bathing, Dressing, Grooming, Continence, Toileting, Ambulation/Mobility, Cane/Walker/W-Chair, Transfer, Exercise/Passive ROM)
  - Time In / Time Out fields
  - Calculated hours (auto, 15-min rounding)

- **IADL Section**
  - Activity checkboxes (Light Housekeeping, Medication Reminders, Laundry, Shopping, Meal Preparation B.L.D., Eating/Feeding)
  - Time In / Time Out fields
  - Calculated hours (auto, 15-min rounding)

- **PCA Initials** (highlighted — distinct background color, bold label)
- **Client Initials** (highlighted — distinct background color, bold label, labeled "Hand device to client")

### Totals Row
- Total PAS (ADL) hours, Total HM (IADL) hours, Total hours

### PCA Signature Section (highlighted)
- PCA full name (text input)
- PCA signature (signature pad)

### Client Signature Section (highlighted)
- Recipient/client name (text input)
- Client signature (signature pad)
- Label: "Hand device to client for signature"

### Submit Button
- **Disabled** until ALL of the following are met:
  - For every day that has any activity checked or time entered: PCA initials filled AND client initials filled
  - PCA full name is filled
  - PCA signature is drawn
  - Client/recipient name is filled
  - Client signature is drawn
- When disabled, show a message listing what's still missing
- When enabled, prominent green button

## Visual Highlighting

Both PCA and client required fields use distinct visual treatment:
- PCA initials + signature section: highlighted background (e.g. blue-tinted)
- Client initials + signature section: highlighted background (e.g. green-tinted)
- Bold labels on all highlighted fields
- "Hand device to client" callout on client sections

## Backend Changes

### SigningToken Generation

`POST /api/timesheets/:id/signing-links`

- Generate **one** token with role `"combined"` instead of two separate tokens
- Return one link instead of two
- Still invalidates previous unused tokens for the timesheet
- 72-hour expiry unchanged

### Signing Form Submission

`PUT /sign/:token`

The `"combined"` role handler saves all data in one request:

**Payload:**
```json
{
  "entries": [
    {
      "id": 123,
      "adlActivities": { "Bathing": true, "Dressing": false, ... },
      "adlTimeIn": "08:00",
      "adlTimeOut": "12:00",
      "adlPcaInitials": "JD",
      "adlClientInitials": "MS",
      "iadlActivities": { ... },
      "iadlTimeIn": "13:00",
      "iadlTimeOut": "15:00",
      "iadlPcaInitials": "JD",
      "iadlClientInitials": "MS"
    }
    // ... 7 entries
  ],
  "pcaFullName": "John Doe",
  "pcaSignature": "<base64 data URI>",
  "recipientName": "Mary Smith",
  "recipientSignature": "<base64 data URI>",
  "completionDate": "2026-04-04"
}
```

**Server processing:**
1. Validate token (exists, not used, not expired)
2. Update each entry: activities, times, PCA initials, client initials
3. Recalculate hours per entry (15-min rounding via `roundTo15` + `computeHours`)
4. Update timesheet: pcaFullName, pcaSignature, recipientName, recipientSignature, completionDate
5. Recalculate totalPasHours, totalHmHours, totalHours
6. Set timesheet status to `"submitted"`, submittedAt to now
7. Mark token as used

### PDF Export

`GET /api/timesheets/:id/export-pdf` (admin only)

Generates a PDF matching the standard Nevada PCA timesheet form:

**Layout:**
- Header: agency info, client name, Medicaid ID, PCA name, week dates
- Grid: ADL activities as rows, 7 days as columns, checkmarks in cells
- Grid: IADL activities as rows, 7 days as columns, checkmarks in cells
- Time rows: In/Out/Hours for ADL and IADL per day
- Initials rows: PCA and client initials per day
- Totals: PAS hours, HM hours, total hours
- Signatures: PCA name + signature image, client name + signature image, supervisor name + signature
- Completion date

**Implementation:** Use `pdfkit` (no additional dependencies beyond the npm package). Generate the PDF server-side and stream it as `Content-Type: application/pdf`.

## Frontend Changes

### SigningFormPage

Rewrite to be a single combined form:
- Shows all 7 day cards with both PCA and client fields
- Highlighted sections for PCA initials/signature and client initials/signature
- Submit button with completeness gating and missing-fields message
- Success screen after submit

### TimesheetFormPage — Share Modal

- Show **one** link instead of two
- Label: "Signing Link (send to PCA)"
- Copy button

### TimesheetsListPage or TimesheetFormPage

- Add "Export PDF" button (visible to admin, for submitted timesheets)
- Calls `GET /api/timesheets/:id/export-pdf`
- Triggers browser download

### api.js

- Update `generateSigningLinks` response handling (one link)
- Add `exportTimesheetPdf(id)` function

## Data Model

No schema changes needed. The existing Timesheet, TimesheetEntry, and SigningToken models support this flow. The only difference is the token role value changes from `"pca"`/`"client"` to `"combined"`.

## What Gets Removed

- Separate PCA and client signing flows in `SigningFormPage`
- Two-link generation in `signingController`
- Two-link display in the share modal

## Unchanged

- Timesheet creation (admin creates, picks client/PCA/week)
- TimesheetEntry structure (7 days, ADL/IADL fields)
- 15-minute rounding on hour calculations
- 72-hour token expiry
- Token one-time use
- Activity lists (9 ADL, 6 IADL)
- Unique constraint on (clientId, pcaName, weekStart)
