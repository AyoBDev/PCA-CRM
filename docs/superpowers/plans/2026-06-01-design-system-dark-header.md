# Design System: Dark Header Standardization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dark gradient table header the default across all pages and apply dark styling to tab navigation on detail pages.

**Architecture:** CSS-only change for tabs. Class addition (`data-table--dark-header`) to existing table elements across 9 pages. One-line CLAUDE.md reference addition.

**Tech Stack:** CSS, React (JSX class changes only)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/index.css` | Modify | Update `.cp-tabs` to dark gradient style |
| `client/src/pages/AuthorizationsPage.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/PermanentLinksPage.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/EmployeeDetailPage.jsx` | Modify | Add `data-table--dark-header` to 2 tables |
| `client/src/pages/TimesheetsListPage.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/scheduling/ScheduleConfirmPage.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/UsersPage.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/scheduling/ScheduleDelivery.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/ClientsPage.jsx` | Modify | Add `data-table--dark-header` class |
| `client/src/pages/PayrollPage.jsx` | Modify | Add `data-table--dark-header` class |
| `CLAUDE.md` | Modify | Add design system reference |

---

### Task 1: Restyle `.cp-tabs` to dark gradient

**Files:**
- Modify: `client/src/index.css:8993-9050`

- [ ] **Step 1: Update the `.cp-tabs` and `.cp-tab` styles**

In `client/src/index.css`, find the `.cp-tabs` block (around line 8993) and replace these rules:

Replace:
```css
.cp-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid hsl(var(--border));
  margin-bottom: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  background: hsl(var(--muted) / 0.5);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 0 8px;
}
.cp-tabs::-webkit-scrollbar {
  display: none;
}
.cp-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.cp-tab:hover {
  color: hsl(var(--foreground));
}
.cp-tab--active {
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
  font-weight: 600;
}
```

With:
```css
.cp-tabs {
  display: flex;
  gap: 0;
  border-bottom: none;
  margin-bottom: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  background: linear-gradient(180deg, hsl(230 35% 22%) 0%, hsl(230 35% 16%) 100%);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 0 8px;
}
.cp-tabs::-webkit-scrollbar {
  display: none;
}
.cp-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(0 0% 75%);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: 0;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.cp-tab:hover {
  color: hsl(0 0% 95%);
}
.cp-tab--active {
  color: hsl(0 0% 100%);
  border-bottom-color: hsl(var(--primary));
  font-weight: 600;
}
```

- [ ] **Step 2: Update `.cp-tab__badge` for dark background**

Find the `.cp-tab__badge` rule (around line 9032) and replace:

```css
.cp-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  line-height: 1;
}
.cp-tab__badge--danger {
  background: hsl(0 84% 95%);
  color: hsl(0 72% 45%);
}
```

With:
```css
.cp-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  background: hsl(0 0% 100% / 0.15);
  color: hsl(0 0% 90%);
  line-height: 1;
}
.cp-tab__badge--danger {
  background: hsl(0 70% 50% / 0.3);
  color: hsl(0 100% 85%);
}
```

- [ ] **Step 3: Verify in browser**

Run the dev server and navigate to a client detail page (`/clients/:id`) and employee detail page (`/employees/:id`). Tabs should have a dark navy gradient background with light text, and the active tab should have white text with a blue bottom border.

```bash
cd client && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css
git commit -m "style: restyle cp-tabs with dark gradient background"
```

---

### Task 2: Add `data-table--dark-header` to all sheet tables

**Files:**
- Modify: `client/src/pages/AuthorizationsPage.jsx:1050`
- Modify: `client/src/pages/PermanentLinksPage.jsx:94`
- Modify: `client/src/pages/EmployeeDetailPage.jsx:1076,1113`
- Modify: `client/src/pages/TimesheetsListPage.jsx:388`
- Modify: `client/src/pages/scheduling/ScheduleConfirmPage.jsx:50`
- Modify: `client/src/pages/UsersPage.jsx:149`
- Modify: `client/src/pages/scheduling/ScheduleDelivery.jsx:139`
- Modify: `client/src/pages/ClientsPage.jsx:752`
- Modify: `client/src/pages/PayrollPage.jsx:995`

- [ ] **Step 1: Update AuthorizationsPage.jsx**

Find line 1050:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 2: Update PermanentLinksPage.jsx**

Find line 94:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 3: Update EmployeeDetailPage.jsx (2 tables)**

Find line 1076:
```jsx
<table className="data-table data-table--sheet" style={{ borderRadius: 0 }}>
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header" style={{ borderRadius: 0 }}>
```

Find line 1113:
```jsx
<table className="data-table data-table--sheet" style={{ borderRadius: 0 }}>
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header" style={{ borderRadius: 0 }}>
```

- [ ] **Step 4: Update TimesheetsListPage.jsx**

Find line 388:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 5: Update ScheduleConfirmPage.jsx**

Find line 50:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 6: Update UsersPage.jsx**

Find line 149:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 7: Update ScheduleDelivery.jsx**

Find line 139:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 8: Update ClientsPage.jsx**

Find line 752:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 9: Update PayrollPage.jsx**

Find line 995:
```jsx
<table className="data-table data-table--sheet">
```
Replace with:
```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

- [ ] **Step 10: Verify in browser**

Check at least 3 pages (Timesheets, Users, Payroll) to confirm dark gradient headers are showing correctly with white text. The header should show:
- Dark navy gradient background
- White/light text (11px uppercase)
- No bottom border on header row

```bash
cd client && npm run dev
```

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/AuthorizationsPage.jsx client/src/pages/PermanentLinksPage.jsx client/src/pages/EmployeeDetailPage.jsx client/src/pages/TimesheetsListPage.jsx client/src/pages/scheduling/ScheduleConfirmPage.jsx client/src/pages/UsersPage.jsx client/src/pages/scheduling/ScheduleDelivery.jsx client/src/pages/ClientsPage.jsx client/src/pages/PayrollPage.jsx
git commit -m "style: apply dark-header to all data tables"
```

---

### Task 3: Add design system reference to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add reference line**

In the root `CLAUDE.md` file, find the `## Conventions` section (near the bottom). Add at the end of that section:

```markdown
- **Design System**: See `docs/superpowers/specs/2026-06-01-design-system-design.md` for color tokens, component patterns, spacing, and UI conventions. Agents must read this before any frontend work.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add design system reference to CLAUDE.md"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Dark header as default → Task 2 (all 9 pages updated)
- ✅ Dark tabs on detail pages → Task 1 (CSS update affects ClientDetailPage + EmployeeDetailPage)
- ✅ CLAUDE.md reference → Task 3

**Placeholder scan:** None found. All steps have exact file paths, line numbers, and code.

**Type consistency:** All class names use `data-table--dark-header` consistently. CSS property names match between the spec and implementation.
