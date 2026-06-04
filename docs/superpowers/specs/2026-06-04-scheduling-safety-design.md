# Scheduling Safety — Undo, Restore, Safeguards & Date-Scoped Edits

## Goal

Prevent accidental mass deletions/edits in scheduling and across the app, provide persistent recovery options, and give users precise control over which dates are affected by bulk operations.

## Architecture

Enhance the existing soft-delete (`archivedAt`) pattern. No new database fields needed — shifts and other entities are already soft-deleted. Add UI safety layers: persistent undo banner, per-page trash drawer, tiered confirmation dialogs, and date checkbox selection for bulk operations.

**Design System:** All new components must follow the app's existing design system (`docs/superpowers/specs/2026-06-01-design-system-design.md`) — use hsl CSS custom property tokens, dark-header table pattern, `btn` class variants, `modal__title`/`modal__desc` patterns, `page-hero__search` for search inputs, and the existing drawer/panel patterns. No inline colors or custom one-off styles.

## Scope

**In scope:**
- Enhanced undo banner (scheduling)
- Per-page trash drawer (Scheduling, Clients, Employees, Authorizations)
- Tiered confirmation safeguards (all delete actions app-wide)
- Date-scoped bulk edit and series delete (scheduling)

**Out of scope:**
- Redo (only undo)
- Auto-purge policy (deleted items stay forever, admin can permanently delete)
- Timesheet/payroll delete safeguards (those already have their own flows)

---

## 1. Enhanced Undo Banner

### Current State
Undo toast appears for ~5 seconds after a bulk action, then disappears. If the user misses it, they have no way to undo.

### New Behavior
- After any bulk delete or bulk edit in scheduling, show a **sticky undo banner** at the top of the scheduling content area
- Banner persists for **30 seconds** with a visible countdown
- Content: "Archived 12 shifts — **Undo** (27s)"
- After 30 seconds, the banner auto-dismisses
- The action remains recoverable via the Trash drawer regardless of whether the banner was used
- Multiple banners stack if user performs several actions quickly (most recent on top)
- Clicking "Undo" immediately restores, removes the banner, and shows a brief "Restored" confirmation

### Component
New component: `client/src/components/common/UndoBanner.jsx`
- Receives: `message`, `onUndo` callback, `duration` (default 30s)
- Renders a fixed-position banner with countdown and dismiss/undo buttons
- Self-dismisses after duration

---

## 2. Per-Page Trash Drawer

### Where It Appears
Every page with deletable entities:
- **Scheduling** — deleted shifts
- **Clients** — archived/deleted clients
- **Employees** — archived/deleted employees
- **Authorizations** — archived authorizations

### UI Pattern
- **Trigger:** "Trash" button (trash icon + count badge showing number of recoverable items) in the page header
- **Drawer:** Slide-out panel from the right (same pattern as existing `ActivityDrawer`)
- **Content per item:**
  - Name/description (shift: date + client + employee + time; client: name + Medicaid ID)
  - Who deleted it (user name)
  - When (relative time, e.g. "2 hours ago")
  - "Restore" button
- **Batch grouping:** For shifts deleted as part of a bulk operation, group them under a collapsible batch header: "Bulk delete — 12 shifts — Jun 3, 2026 by Admin". One-click "Restore All" for the batch.
- **Bulk restore:** Checkbox selection + "Restore Selected" button
- **Permanent delete (admin-only):** "Permanently Delete" button requires typed confirmation ("PERMANENT DELETE") and hard-deletes from database. No undo.
- **Search:** Text search to find specific items by name/date
- **Sort:** Most recently deleted first

### Data Source
- Query: `WHERE archivedAt IS NOT NULL`
- For shifts: join with `BulkEditBatch` to group by batch
- No pagination limit (since no auto-purge, show all — lazy load if list grows large)

### API
- Existing queries already support filtering by `archivedAt`
- New endpoint: `POST /api/shifts/restore` — accepts array of shift IDs, sets `archivedAt: null`
- New endpoint: `DELETE /api/shifts/permanent` — admin-only, hard deletes (requires `requireRole('admin')`)
- Same pattern for clients/employees: `POST /api/clients/restore`, `DELETE /api/clients/permanent`

---

## 3. Tiered Confirmation Safeguards

### Applies To
All delete actions across the app: shifts, clients, employees, authorizations, payroll runs.

### Tiers

| Item Count | Confirmation UI |
|------------|----------------|
| 1 item | Simple modal: shows item details, "Are you sure?" + Cancel/Delete buttons |
| 2–4 items | Modal: shows scrollable list of all affected items with details, Cancel/Delete buttons |
| 5+ items | Modal: shows scrollable list of affected items + **typed confirmation input**. User must type "DELETE {count}" (e.g. "DELETE 12") exactly to enable the Delete button. Button stays disabled until input matches. |

### Series Delete (Scheduling-Specific)
When deleting a single shift that belongs to a recurring series (`recurringGroupId` exists):
- Modal shows two explicit options:
  - "Delete this shift only" (single shift, simple confirmation)
  - "Delete from series..." (opens date selection — see Section 4)
- No more silent "delete all in group" without user seeing exactly what's affected

### Scope Visibility (Blocking)
- Every confirmation modal displays: affected dates, client names, employee names
- If multiple clients OR multiple employees are affected, show a **blocking warning banner** (orange/red) inside the modal that the user must acknowledge with a checkbox: "I understand this affects multiple clients/employees"
- This replaces the current non-blocking yellow warning text

---

## 4. Date-Scoped Bulk Edit & Series Delete

### Problem
The current "Apply to future" checkbox in BulkEditModal applies changes to ALL future recurring shifts with no date selection. The series delete archives ALL shifts in the group.

### Date Selection Panel

A new UI panel that appears in two contexts:
1. **BulkEditModal "Apply to future"** — when user toggles this on
2. **Series delete** — when user chooses "Delete from series..."

### Panel UI
- **Header:** "Select dates to affect" with count: "(3 of 24 selected)"
- **Quick actions:** "Select All" | "Next 4 Weeks" | "Clear All"
- **Date list:** Checkbox list of all future dates in the series, each row showing:
  - Checkbox
  - Date (e.g. "Mon, Jun 9")
  - Client name
  - Time (e.g. "9:00 AM – 1:00 PM")
  - Employee name
- **Grouped by week** with week headers for readability
- **Default state:** ALL UNCHECKED — user must explicitly opt in to each date
- **Action button:** Shows exact count: "Apply Changes to 8 Shifts" or "Delete 8 Shifts"
- This count feeds into the tiered confirmation (5+ triggers typed confirmation)

### Key Principle
No bulk action affects dates the user didn't explicitly select. The default is always the minimum scope (just the selected shift), and expanding scope requires deliberate action.

### Data Flow
1. User toggles "Apply to future" or clicks "Delete from series"
2. Frontend fetches all future shifts with the same `recurringGroupId`
3. Renders date checkbox list panel
4. User checks desired dates
5. User clicks Apply/Delete → goes through tiered confirmation
6. API receives explicit array of shift IDs (not "all future" flag)

### Backend Change
- The `applyToFuture: true` flag remains supported in the bulk update API for backward compatibility, but the frontend stops sending it
- Instead, the frontend always sends an explicit list of shift IDs (resolved from the date selection panel)
- This makes scope selection fully visible and explicit — the backend simply processes whatever IDs it receives

---

## 5. Component Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| `UndoBanner` | `client/src/components/common/UndoBanner.jsx` | Persistent 30s undo banner |
| `TrashDrawer` | `client/src/components/common/TrashDrawer.jsx` | Per-page trash drawer with restore |
| `DeleteConfirmModal` | `client/src/components/common/DeleteConfirmModal.jsx` | Tiered confirmation (simple/list/typed) |
| `DateSelectionPanel` | `client/src/pages/scheduling/DateSelectionPanel.jsx` | Checkbox date list for scoped edits |

---

## 6. Testing Checklist

- Undo banner appears after bulk delete, persists 30s, undo restores shifts
- Trash drawer shows all archived items, grouped by batch for shifts
- Single restore and batch restore work correctly
- Permanent delete requires admin role and typed confirmation
- Deleting 1-4 items shows item list confirmation
- Deleting 5+ items requires typed "DELETE {count}"
- Series delete shows date selection panel, defaults unchecked
- Bulk edit "apply to future" shows date selection panel, defaults unchecked
- Selecting 5+ dates in date panel triggers typed confirmation
- Multi-client/employee warning is blocking (checkbox acknowledgment)
- All flows work across: Scheduling, Clients, Employees, Authorizations
