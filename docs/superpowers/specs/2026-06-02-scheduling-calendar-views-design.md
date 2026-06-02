# Scheduling Calendar Views — Design Spec

## Overview

Add Monthly and Future calendar views to the Scheduling module. Currently only a weekly view exists, making it impossible to quickly spot shifts scheduled far into the future. A former scheduler created recurring shifts months ahead without the team knowing, causing "exceeded hours" errors when creating new schedules.

## Decisions

- **View switcher:** Three tabs — Week | Month | Future — in the scheduling page hero area
- **Monthly view:** 7-column calendar grid with hybrid detail (up to 3 shift blocks per cell, "+N more" overflow)
- **Future view:** Grouped table of all shifts from today onward, with bulk select/delete and recurring group detection
- **Backend:** Extend `/shifts` endpoint to accept `startDate`/`endDate` params (capped at 6 months)
- **No new pages:** All views live within the existing SchedulingPage, sharing filters and client/employee selection
- **File decomposition:** Extract views into separate component files since SchedulingPage is already 2700 lines

## View Switcher & Navigation

A segmented button group (Week | Month | Future) replaces the current inline week picker when month or future views are active.

**Navigation per view:**
- **Week:** Prev/next week arrows + date picker. Shows "Week of Jun 1, 2026"
- **Month:** Prev/next month arrows + month/year display. Shows "June 2026"
- **Future:** Date range filter (start month → end month, default: today → 6 months out). No prev/next arrows.

View state is component-local. Switching views preserves the selected client/employee context. When switching from Month to Week, the week containing the 1st of the viewed month is selected. When clicking a day in the Monthly view, user can jump to that week in the Weekly view.

## Monthly Calendar View

### Layout

A standard 7-column grid (Sun–Sat) rendering the full month (4-6 rows depending on month). Uses the same design system card/sheet pattern for the container.

### Day Cells

Each day cell shows:
- Day number in the top-left corner
- Up to 3 shift blocks using the same styling as the weekly view (`weekly-cal__shift` pattern: service color dot + name + time range)
- If the day has more than 3 shifts, a "+N more" button appears that opens a popover listing all shifts for that day
- Clicking a shift opens the ShiftFormModal for editing (same behavior as weekly view)
- Overlap/conflict shifts show the red border treatment (`weekly-cal__shift--overlap`)
- Today gets a highlighted background
- Days outside the current month render with reduced opacity

### Filters

Reuses the same search bar and service code filter from the weekly calendar toolbar. Client/employee selector from the page-level still applies — selecting an employee filters the monthly view to only their shifts.

### Data Loading

Fetches shifts for the entire month in a single API call using `startDate` (1st of month) and `endDate` (last of month). No unit summary computation for the monthly view (not relevant at this scale).

## Future Shifts View

### Purpose

Investigation and cleanup — find shifts scheduled far into the future, identify recurring groups, and bulk-delete them.

### Layout

A table grouped by month sections:

**Month section header:** "June 2026" (with shift count badge, e.g., "23 shifts")

**Table columns:**
| Date | Day | Client | Employee | Service | Time | Account | Recurring | Select |
|------|-----|--------|----------|---------|------|---------|-----------|--------|

- **Date:** formatted as "Jun 2" 
- **Day:** abbreviated day name (Mon, Tue...)
- **Client:** client name
- **Employee:** employee/caregiver name
- **Service:** service code badge (colored, same as weekly view)
- **Time:** start – end in 12h format
- **Account:** account number
- **Recurring:** recurring group icon/badge if `recurringGroupId` is set. Clicking the icon selects all shifts in that recurring group.
- **Select:** checkbox for bulk operations

### Bulk Operations

- Checkbox per row + "Select all" per month group
- "Select recurring group" action (when clicking the recurring badge) — selects all future shifts sharing that `recurringGroupId`
- Bulk delete button in a sticky action bar (same pattern as task bulk actions)
- Confirmation modal before delete showing count and date range

### Filters

- Client (searchable select)
- Employee (searchable select)
- Service code (dropdown)
- Date range: start month and end month (default: current month to +6 months)

### Data Loading

Single API call with `startDate` (today) and `endDate` (6 months out by default, adjustable). The response skips unit summary computation for performance.

## Backend Changes

### Extend `GET /shifts` endpoint

**Current:** Accepts `weekStart` param, returns 7 days of shifts.

**New:** Also accept optional `startDate` and `endDate` query params.

Logic:
- If `startDate` and `endDate` are provided, use those as the date range (ignore `weekStart`)
- Cap the range at 6 months (182 days) to prevent runaway queries
- If `weekStart` is provided (and no startDate/endDate), behave as today (7-day range)
- When using `startDate`/`endDate`, skip the unit summary computation (return empty `unitSummaries: {}`)
- Still return overlaps detection and enriched shifts

**Response shape stays the same:** `{ shifts, overlaps, unitSummaries }`

### No new endpoints needed

The existing `/shifts` endpoint already supports `clientId` and `employeeId` filters. Adding `startDate`/`endDate` is sufficient.

## File Structure

Given SchedulingPage is already 2700 lines, extract the new views into separate files:

| File | Responsibility |
|------|---------------|
| `client/src/pages/SchedulingPage.jsx` | Modify: add view switcher state, render new views conditionally |
| `client/src/components/scheduling/MonthlyCalendarView.jsx` | Create: monthly calendar grid component |
| `client/src/components/scheduling/FutureShiftsView.jsx` | Create: future shifts table with bulk operations |
| `client/src/components/scheduling/ViewSwitcher.jsx` | Create: Week/Month/Future segmented button |
| `client/src/index.css` | Modify: add monthly calendar and future view styles |
| `server/src/controllers/schedulingController.js` | Modify: extend `listShifts` to accept startDate/endDate |
| `client/src/api.js` | Modify: update `getShifts` to pass startDate/endDate params |

## Styling

All new components follow the existing design system:
- Monthly grid uses `sheet-card` container with the same calendar styling patterns as `weekly-cal`
- Future view table uses `data-table data-table--sheet data-table--dark-header`
- Month group headers use the same pattern as `attention-section__header`
- Bulk action bar matches the task page bulk actions pattern
- View switcher uses segmented button pattern (`.btn--outline` group with `.btn--active` on selected)

## Out of Scope

- Drag-and-drop shift rescheduling
- Print/export of monthly view
- PCA-facing views (this is admin-only scheduling management)
- Editing shifts inline in the future view (click opens the existing ShiftFormModal)
- Year-at-a-glance mini calendar
