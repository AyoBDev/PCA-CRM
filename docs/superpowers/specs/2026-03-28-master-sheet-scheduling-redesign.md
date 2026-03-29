# Master Sheet & Scheduling Redesign — Design Spec

**Date:** 2026-03-28
**Branch:** Schduling-Feature (or dev/modular-rewrite)

## Problem

1. The Master Sheet (ClientsPage) has 15 columns at 1200px min-width. The layout feels oversized, cluttered, and requires excessive horizontal scrolling for daily use.
2. The Scheduling calendar has days on the left and hours across the top. The user wants the opposite — days across the top and hours down the left — so multiple shifts per day stack vertically and are easier to read.
3. The shift form is missing fields needed for daily operations: Account Number, SANDATA Client ID, and client-level notes (address, phone, gate code, notes).

## Design

### 1. Master Sheet — Compact Table + Detail Panel

#### Main Table (6 columns)

| Column | Content | Notes |
|--------|---------|-------|
| Client Name | Bold, primary identifier | |
| Medicaid ID | Muted secondary text | |
| Insurance Type | Badge | |
| Status | Color-coded badge (OK / Renewal Reminder / Expired) | |
| Days to Expire | Color-coded number | Minimum `daysToExpire` across all authorizations (most urgent) |
| Actions | Edit, Delete buttons | |

- Remove `min-width: 1200px` — table fits naturally at any viewport width
- No checkbox column, no expand toggle, no service columns in the main table
- Bulk select/delete functionality removed (use individual delete or the existing Client Edit modal)
- Clicking a row opens the detail panel (replaces expand/collapse child rows)
- Filtering stays the same: status tabs (All / OK / Renewal Reminder / Expired) + search bar

#### Detail Panel — new `DrawerPanel` component

- ~400px wide, slides in from right, overlays content with a semi-transparent backdrop
- `position: fixed`, `right: 0`, `z-index: 50` (above sidebar's z-index)
- Closes on backdrop click, Escape key, or close button
- On viewports < 700px wide, panel becomes full-width (100%)

**Header:**
- Client name, Medicaid ID, insurance badge
- Edit Client button (opens existing ClientFormModal — see below for updates)

**Client Notes Section (editable inline):**
- Address (text input)
- Phone (text input)
- Gate Code (text input)
- Notes (textarea) — uses the existing `notes` field on the Client model
- Save button to persist changes via `PATCH /api/clients/:id`

**Authorizations Table:**
- Columns: Service Category, Service Code, Service Name, Units, Start Date, End Date, Status, Days to Expire, Notes
- Scrolls vertically within the panel if many authorizations (no pagination — clients typically have < 10 authorizations)
- Add Authorization button at the bottom
- Edit/Delete per row

#### Client Edit Modal Updates

The existing `ClientFormModal` gains 4 new fields below the existing ones:
- Address (text input)
- Phone (text input)
- Gate Code (text input)
- Notes (textarea)

Layout: 2-column grid for Address/Phone, full-width for Gate Code and Notes.

### 2. Client Model — No Schema Changes Needed

The Client model **already has** `address`, `phone`, `gateCode`, and `notes` fields in the Prisma schema. No migration required for the client table.

These existing fields are currently accepted by `PUT /api/clients/:id` but are not surfaced in the UI. This redesign surfaces them in:
- The detail panel (inline editable)
- The Client Edit modal (new form fields)
- The shift form (pre-filled, editable, saves back)

#### New Endpoint: PATCH /api/clients/:id

A new partial-update endpoint that accepts any subset of `address`, `phone`, `gateCode`, `notes` without requiring `clientName`. Coexists with the existing `PUT` on the same path (different HTTP method). Used by:
- The detail panel's inline save
- The shift form's client details save

This avoids modifying the existing `PUT /api/clients/:id` which requires `clientName` for full updates.

### 3. Scheduling Calendar — Flipped Grid (Full Rewrite of ScheduleTimeGrid)

The existing `ScheduleTimeGrid` component (days as rows, hours across top) is **replaced entirely** with a new `ScheduleWeekGrid` component (days as columns, hours as rows).

#### Layout

```
              │  Sun 3/15  │  Mon 3/16  │  Tue 3/17  │  Wed 3/18  │  Thu 3/19  │  Fri 3/20  │  Sat 3/21
──────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼───────────
  4:00 AM     │            │            │            │            │            │            │
  5:00 AM     │            │            │            │            │            │            │
  ...         │            │            │            │            │            │            │
  9:00 AM     │  [PCS]     │  [S5130]   │            │  [PCS]     │            │            │
 10:00 AM     │  Smith J.  │  Doe A.    │            │  Smith J.  │            │            │
  ...         │            │            │            │            │            │            │
 11:00 PM     │            │            │            │            │            │            │
```

#### Grid Dimensions

- **Time gutter (left):** 60px fixed width, shows hour labels
- **Day columns:** Equal width, flex: 1 each (≈14.3% of remaining space)
- **Hour row height:** 60px per hour
- **Total grid height:** 20 rows × 60px = 1200px (scrolls vertically within the page)

#### Shift Block Positioning

- Blocks use `position: absolute` within each day column (which has `position: relative`)
- `top`: calculated as `(startHour - 4) * 60 + (startMinute / 60) * 60` px
- `height`: calculated as `durationHours * 60` px
- Example: a 9:30 AM – 1:00 PM shift → top: 330px, height: 210px

#### Overlap Handling

When shifts overlap within the same day:
- Column splits: 2 overlapping shifts each get 50% width, 3 get 33%, etc.
- Overlap warning indicator (red border + pulse animation) remains
- System already warns/prevents overlaps; this is a fallback display

#### Click-to-Add Behavior

- Clicking an empty area snaps to the **nearest hour**. E.g., clicking at y-offset 330px → (330 / 60) + 4 = 9.5 → rounds to 10:00 AM; clicking at 300px → (300 / 60) + 4 = 9.0 → 9:00 AM
- Opens shift form pre-filled with that day and snapped time

#### Today Highlight

Current day column gets light blue background (`hsl(217 91% 98%)`)

#### Overnight Shifts

Shifts that extend past 11:00 PM (e.g., end at 1:00 AM) are clipped to the 11 PM boundary visually, with a "continues next day" indicator. The data model stores the actual times.

#### Week Navigation

Prev/Next/Today buttons, same as current.

#### View Modes (unchanged)

- **Overview:** All shifts visible
- **Client view:** Select client → see only their shifts
- **Employee view:** Select employee → see only their shifts

### 4. Shift Model — New Fields

| Field | Type | DB Column | Default |
|-------|------|-----------|---------|
| `accountNumber` | String | `account_number` | `""` |
| `sandataClientId` | String | `sandata_client_id` | `""` |

Note: `sandataClientId` is a SANDATA external identifier string (e.g., "ABC123"), **not** a database foreign key. The existing `clientId` (Int) FK to the Client table is unchanged.

**Server-side validation:** `accountNumber` is validated against the allowed set (`71040`, `71119`, `71120`, `71635`). Empty string is also accepted for backward compatibility — existing shifts created before this migration will have `accountNumber = ""`.

**Backward compatibility:** Existing shifts have empty `accountNumber` and `sandataClientId`. The calendar grid and list views display these fields gracefully (show nothing when empty). `accountNumber` is required in the form for **new shifts only** — when editing an existing shift with an empty account number, the field is shown but not enforced.

Migration: Add two columns to the `shifts` table with empty string defaults. Non-destructive, no data loss.

### 5. Shift Form — Updated Fields

Full field list for ShiftFormModal:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Client | Dropdown | Yes | Existing |
| Employee | Dropdown | Yes | Existing |
| Account Number | Dropdown | Yes | Fixed options: 71040, 71119, 71120, 71635. Hardcoded in frontend — these are SANDATA EVV account numbers unlikely to change. If they do change, a code update is needed. |
| Service Code | Dropdown | Yes | Existing (PCS, S5125, S5130, SDPC, S5135, S5150) |
| SANDATA Client ID | Text input | No | Manual entry — external SANDATA identifier for this client+account combination |
| Shift Date | Date input | Yes | Existing |
| Start Time | Time input | Yes | Existing (default 09:00) |
| End Time | Time input | Yes | Existing (default 13:00) |
| Hours / Units | Read-only | — | Computed display |
| Auth Info | Read-only | — | Authorization validation warnings |
| Recurring | Toggle + date | No | Existing (repeat weekly until date) |
| Status | Dropdown | — | Edit mode only (scheduled/completed/cancelled) |
| Shift Notes | Text input | No | Existing |
| **Client Details** | | | Section appears when client is selected. Label: "Client Details (saved to client record)" |
| Address | Text input | No | Pre-fills from selected client's record |
| Phone | Text input | No | Pre-fills from selected client's record |
| Gate Code | Text input | No | Pre-fills from selected client's record |
| Notes | Textarea | No | Pre-fills from selected client's record (uses existing `notes` field) |

**Save behavior:** On shift save, if any client detail fields differ from the original client record values, a `PATCH /api/clients/:id` call updates the client record. This is a known trade-off: if two admins edit the same client's notes simultaneously, last write wins. Acceptable for a small agency.

### 6. Notification Updates

`formatScheduleSms()` and `formatScheduleEmailHtml()` updated to include:

**SMS format addition:**
```
📍 {address}
📞 {phone}
🔑 Gate: {gateCode}
📝 {notes}
Account: {accountNumber} | Client ID: {sandataClientId}
```

**Email HTML:** Same fields in a styled info block within the existing shift detail table.

Fields are omitted from the message if empty.

### 7. API Changes

**New endpoint:**
- `PATCH /api/clients/:id` — partial update accepting `address`, `phone`, `gateCode`, `notes`. Does not require `clientName`. Returns updated client.

**Existing endpoints modified:**
- `POST /api/shifts` — accepts `accountNumber`, `sandataClientId`
- `PUT /api/shifts/:id` — accepts `accountNumber`, `sandataClientId`
- `GET /api/clients` — already returns `address`, `phone`, `gateCode`, `notes` (no change needed)
- `GET /api/shifts` — includes `accountNumber`, `sandataClientId` in response (automatic from Prisma)

### 8. Component Summary

| Component | Action |
|-----------|--------|
| `ScheduleTimeGrid` | **Removed** — replaced by `ScheduleWeekGrid` |
| `ScheduleWeekGrid` | **New** — flipped calendar grid (days across, hours down) |
| `DrawerPanel` | **New** — reusable slide-out panel component |
| `ClientsPage` | **Rewritten** — compact 6-column table + DrawerPanel for detail |
| `ClientFormModal` | **Updated** — add address, phone, gateCode, notes fields |
| `ShiftFormModal` (in SchedulingPage) | **Updated** — add account number, SANDATA client ID, client details section |
| `notificationService` | **Updated** — include new fields in SMS/email templates |

## Out of Scope

- PCA employee-facing view of notes (admin-only for now, included in notifications)
- SANDATA Client ID auto-fill based on account number (manual entry each time)
- Account number stored on client record (stored per shift only)
- Keyboard navigation for the calendar grid
- Account numbers managed via admin UI (hardcoded for now)
