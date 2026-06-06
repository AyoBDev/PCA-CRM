# Quick Fixes Bundle

## Goal

Address five small UI/UX issues across the app: missing service names on authorizations page, dangerous "Delete All" button on scheduling, unclear sort indicator on client list, missing tab dividers on detail pages, and consistent styling.

---

## 1. Authorization Page — Show Service Name

### Problem
The authorization list table and side drawer only display `serviceCode` (e.g., "PCS", "S5130") without the human-readable service name. Users can't tell what a code means without opening the edit form.

### Solution

**Main table row (expanded client view):**
- Currently shows: `PCS`
- Change to show: `PCS — Personal Assistance Services`
- Format: `{auth.serviceCode}{auth.serviceName ? ` — ${auth.serviceName}` : ''}`

**Side drawer table:**
- Add a "Name" column after the "Code" column
- Display: `{auth.serviceName || '—'}`

### Files
- Modify: `client/src/pages/AuthorizationsPage.jsx`
  - Table row at ~line 1273: change serviceCode cell to include serviceName
  - Drawer table at ~line 1468: add serviceName column header and data cell

---

## 2. Scheduling — Remove "Delete All" Button

### Problem
The red "Delete All" button is prominently visible in the scheduling toolbar. One accidental click (even with confirmation) is too risky for a button that archives every shift for the week.

### Solution
- Remove the "Delete All" button entirely from the toolbar (lines 2529-2533 in SchedulingPage.jsx)
- Change trash button tooltip from "View deleted shifts" to "View archived shifts"
- The capability to bulk-delete shifts remains available through the Bulk Edit modal for intentional use

### Files
- Modify: `client/src/pages/SchedulingPage.jsx`
  - Remove the Delete All button JSX (~lines 2529-2533)
  - Update trash button title attribute (~line 2517)

---

## 3. Client List — Sort Direction Arrows

### Problem
The current sort indicator is a plain unicode arrow (`↑`/`↓`) that's hard to notice and doesn't clearly communicate clickability or sort direction.

### Solution
- Replace the unicode arrow with `Icons.chevronUp` / `Icons.chevronDown` from the existing Icons component
- Keep the click behavior the same (toggles between A-Z and Z-A)

### Files
- Modify: `client/src/pages/ClientsListPage.jsx`
  - Sort indicator in table header (~line 207): replace unicode with Icon component

---

## 4. Detail Pages — Tab Dividers

### Problem
Tabs on client and employee detail pages run together without visual separation, making it harder to distinguish individual tab items.

### Solution
- Add a subtle 1px vertical divider between tabs using CSS `border-right` on `.cp-tab` (except the last child)
- Color: `hsl(240 5.9% 90%)` (zinc-200 from design system)
- Height: 60% of the tab height, vertically centered (using a pseudo-element or partial border)

### Files
- Modify: `client/src/index.css`
  - Add rule: `.cp-tab:not(:last-child)` with a right border or `::after` pseudo-element divider

---

## 5. Consistent Tab Styling

### Current State
- `ClientDetailPage` and `EmployeeDetailPage` both already use the shared `.cp-tabs` / `.cp-tab` classes
- No other pages use this navigation tab pattern (Timesheets and Scheduling use filter pills/buttons, not tabs)
- The divider CSS change in item 4 automatically applies to both detail pages

### Solution
No additional work needed — the CSS fix in item 4 covers both pages since they share the same classes. The other pages use different UI patterns (filter bars, view switchers) that are appropriate for their context.

---

## Scope Exclusions

- No backend changes needed (all data already exists in API responses)
- No changes to Timesheets or Scheduling tab/filter patterns (those are redesign items for later specs)
- "Delete All" functionality is not removed from the codebase — just hidden from the toolbar. The `handleDeleteAllShifts` function and confirmation modal remain for potential future use in Bulk Edit.
