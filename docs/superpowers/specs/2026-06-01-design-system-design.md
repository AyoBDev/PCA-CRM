# Design System Reference

## Goal

A single-source-of-truth document that AI agents read before any frontend work. Ensures visual consistency across new pages, components, and modifications without needing to inspect existing code patterns each time.

## Audience

AI coding agents (Claude Code, Copilot, etc.) building or modifying the NV Best PCA frontend.

---

## Color Tokens (CSS Custom Properties)

All colors are defined as HSL channel values in `:root` on `client/src/index.css`.

### Core Palette

| Variable | Value | Usage |
|----------|-------|-------|
| `--primary` | `217 91% 60%` | Primary actions, links, focus rings |
| `--primary-foreground` | `0 0% 100%` | Text on primary backgrounds |
| `--secondary` | `240 4.8% 95.9%` | Secondary element backgrounds |
| `--secondary-foreground` | `240 5.9% 10%` | Text on secondary |
| `--accent` | `213 94% 95%` | Hover states, focus highlights |
| `--accent-foreground` | `217 91% 40%` | Text on accent |
| `--muted` | `240 4.8% 95.9%` | Muted backgrounds |
| `--muted-foreground` | `240 3.8% 46.1%` | Secondary/helper text |
| `--foreground` | `240 10% 3.9%` | Primary text |
| `--background` | `0 0% 100%` | Page background |
| `--card` | `0 0% 100%` | Card surface |
| `--border` | `240 5.9% 90%` | Borders, dividers |
| `--input` | `240 5.9% 90%` | Input borders |
| `--ring` | `217 91% 60%` | Focus ring (matches primary) |
| `--radius` | `0.5rem` | Standard border radius (8px) |

### Semantic Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--success` | `160 84% 39%` | Success states |
| `--success-bg` | `142 76% 96%` | Success backgrounds |
| `--warning` | `38 92% 50%` | Warning states |
| `--warning-bg` | `38 100% 96%` | Warning backgrounds |
| `--danger` | `0 84% 60%` | Error/destructive |
| `--danger-bg` | `0 93% 97%` | Error backgrounds |
| `--destructive` | `0 84.2% 60.2%` | Destructive actions |

### Sidebar Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--sidebar-bg` | `hsl(220 70% 14%)` | Dark navy background |
| `--sidebar-bg-hover` | `hsl(220 60% 20%)` | Hover state |
| `--sidebar-bg-active` | `hsl(220 60% 24%)` | Active item |
| `--sidebar-text` | `hsl(210 40% 80%)` | Default text |
| `--sidebar-text-active` | `hsl(0 0% 100%)` | Active/hover text |
| `--sidebar-text-muted` | `hsl(215 30% 55%)` | Section labels |
| `--sidebar-border` | `hsl(220 50% 20%)` | Dividers |
| `--sidebar-accent` | `hsl(217 91% 60%)` | Accent (matches primary) |

---

## Typography

**Font:** Inter (400, 500, 600, 700) from Google Fonts, fallback to system sans-serif.

**Base size:** 14px on `html`.

### Size Scale

| Size | Usage |
|------|-------|
| 10px | Uppercase micro labels, tiny badges |
| 11px | Badge text, status cells, form hints, table headers (uppercase) |
| 12px | Secondary text, timestamps, compact table body |
| 13px | Body text, form labels, nav items, button labels |
| 14px | Larger body, form fields, standard table body |
| 15px | Section headers |
| 17px | Modal titles |
| 22px | Page hero titles |
| 28px | Card stat values |

### Weight Usage

| Weight | Usage |
|--------|-------|
| 400 | Body text |
| 500 | Labels, nav items |
| 600 | Section titles, badges, active states |
| 700 | Page titles, stat values, table dark headers |

### Line Heights

- `1.2` — Headings
- `1.4` — Form inputs
- `1.5` — Body text (default)

---

## Spacing

**Base unit:** 8px. Approximate scale:

| Value | Usage |
|-------|-------|
| 2px | Micro gaps (badge dots, thin borders) |
| 4px | XS gaps (button padding, icon spacing) |
| 6px | Small (form field internal padding) |
| 8px | Standard (nav items, element gaps) |
| 10px | Medium (filter bar, attention items) |
| 12px | Table cell padding |
| 16px | Section padding, large gaps |
| 20px | Card content, drawer sections |
| 24px | Page content padding, modal padding |
| 32px | Page hero horizontal padding |

### Layout Dimensions

| Property | Value |
|----------|-------|
| Sidebar expanded | 256px |
| Sidebar collapsed | 52px |
| Content background | `hsl(220 20% 97%)` |
| Content padding | 24px |
| Modal max-width | 520px (default), 640px (wide) |
| Drawer width | 400px |

### Breakpoints

- `768px` — Mobile → tablet
- `1200px` — Tablet → desktop

### Box Shadows

- Subtle: `0 1px 3px hsl(0 0% 0% / 0.04)` — cards, inputs
- Medium: `0 2px 8px hsl(var(--foreground) / 0.06)` — hover
- Strong: `0 4px 12px hsl(0 0% 0% / 0.06)` — card hover lift
- Modal: `0 16px 70px hsl(var(--foreground) / 0.15)`
- Focus: `0 0 0 2px hsl(var(--ring) / 0.1)` — form focus ring

### Transitions

- Fast: `0.15s ease` — interactions
- Medium: `0.2s ease` — layout, sidebar

---

## Page Structure

Every page follows this pattern:

```jsx
<div className="page-hero">
  <div className="page-hero__left">
    <div className="page-hero__icon">{Icons.icon}</div>
    <div>
      <div className="page-hero__title">Page Title</div>
      <div className="page-hero__subtitle">Description</div>
    </div>
  </div>
  <div className="page-hero__right">
    <input className="page-hero__search" placeholder="Search..." />
    <button className="btn btn--primary">{Icons.plus} Add Item</button>
  </div>
</div>

{/* Filter bar or tabs */}
{/* Content area (table, cards, form) */}
{/* Pagination */}
```

---

## Tables

### Default Style: Dark Header

**All tables use the dark gradient header by default.** This is the standard:

```jsx
<div className="sheet-card">
  <div className="sheet-card__header">
    <h2 className="sheet-card__title">{Icons.table} Title</h2>
    <div className="sheet-card__actions">{/* buttons */}</div>
  </div>
  <div className="table-scroll">
    <table className="data-table data-table--dark-header">
      <thead>
        <tr>
          <th>Column</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Data</td></tr>
      </tbody>
    </table>
  </div>
  <div className="table-info-bar">
    <span>Showing X of Y</span>
    {/* pagination */}
  </div>
</div>
```

**Dark header CSS:**
```css
.data-table--dark-header thead tr {
  background: linear-gradient(180deg, hsl(230 35% 22%) 0%, hsl(230 35% 16%) 100%);
}
.data-table--dark-header thead th {
  color: hsl(0 0% 95%);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 16px;
  border-bottom: none;
}
```

### Master Sheet Variant

For pages with expandable rows (clients, employees):

```jsx
<table className="data-table data-table--sheet data-table--dark-header">
```

Adds sticky header and white text on sidebar-bg color.

### Compact Variant

For inline/drawer tables with less data:

```jsx
<table className="data-table data-table--compact">
```

12px font, minimal padding (6px 8px), no uppercase headers, no background.

### Table Info Bar

Always placed below the table, shows record counts:

```jsx
<div className="table-info-bar">
  <span>Showing {pageItems} of {total} records</span>
  <Pagination ... />
</div>
```

---

## Tabs

### Standard: Dark Header Tabs

**Tabs use the same dark gradient as table headers.** This is the standard for detail pages (ClientDetailPage, EmployeeDetailPage):

```jsx
<div className="cp-tabs">
  {TABS.map(tab => (
    <button
      key={tab.key}
      className={`cp-tab ${activeTab === tab.key ? 'cp-tab--active' : ''}`}
      onClick={() => setActiveTab(tab.key)}
    >
      {tab.label}
      {tab.badge > 0 && (
        <span className="cp-tab__badge">{tab.badge}</span>
      )}
    </button>
  ))}
</div>
<div className="cp-tab-content">
  {activeTab === 'profile' && <ProfileTab />}
</div>
```

**Target styling (dark header):**
```css
.cp-tabs {
  display: flex;
  gap: 0;
  overflow-x: auto;
  background: linear-gradient(180deg, hsl(230 35% 22%) 0%, hsl(230 35% 16%) 100%);
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 0 8px;
}
.cp-tab {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(0 0% 75%);
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.cp-tab:hover {
  color: hsl(0 0% 95%);
}
.cp-tab--active {
  color: hsl(0 0% 100%);
  border-bottom-color: hsl(var(--primary));
}
```

### Filter Button Tabs

For status filtering (list pages):

```jsx
<div className="filter-bar">
  {filters.map(f => (
    <button
      className={`filter-btn ${active === f ? 'filter-btn--active' : ''} 
        ${f === 'Expired' ? 'filter-btn--danger' : ''}`}
      onClick={() => setFilter(f)}
    >
      {f} <span className="filter-btn__count">{count}</span>
    </button>
  ))}
</div>
```

---

## Buttons

### Variants

| Class | Usage |
|-------|-------|
| `btn btn--primary` | Primary actions (blue bg, white text) |
| `btn btn--outline` | Secondary actions (light blue bg, blue border) |
| `btn btn--ghost` | Minimal/tertiary (transparent, blue text) |
| `btn btn--danger` | Destructive (red bg, white text) |
| `btn btn--danger-ghost` | Destructive minimal (transparent, red text) |
| `btn btn--success` | Positive confirm (green bg) |
| `btn btn--warning` | Caution (orange bg) |
| `btn btn--restore` | Archive restore (green text, light green hover) |

### Sizes

| Class | Padding | Font |
|-------|---------|------|
| (default) | 8px 16px | 13px |
| `btn--sm` | 6px 12px | 12px |
| `btn--xs` | 4px 8px | 12px |
| `btn--icon` | 0 (32x32 square) | — |

### Pattern

```jsx
<button className="btn btn--primary">{Icons.plus} Add Item</button>
<button className="btn btn--outline btn--sm">Cancel</button>
<button className="btn btn--ghost btn--icon" title="Edit">{Icons.edit}</button>
```

---

## Cards

### Stat Card (Dashboard KPIs)

```jsx
<div className="stats-grid">
  <div className="card">
    <div className="card__header">
      <span className="card__title">Active Clients</span>
      <span className="card__icon">{Icons.users}</span>
    </div>
    <div className="card__value">42</div>
    <div className="card__description">+3 this week</div>
  </div>
</div>
```

Hover lifts the card slightly. Use `card--clickable` for click interactions, `card--active` for selected state (blue border).

### Summary Card (Timesheets)

```jsx
<div className="ts-summary-cards">
  <div className="ts-summary-card">
    <div className="ts-summary-card__icon ts-summary-card__icon--draft">{Icons.edit}</div>
    <div className="ts-summary-card__content">
      <span className="ts-summary-card__label">Draft</span>
      <span className="ts-summary-card__value">{count}</span>
    </div>
  </div>
</div>
```

Icon color variants: `--total`, `--draft`, `--submitted`, `--accepted`, `--overdue`.

### Info Card (Timesheet Form)

```jsx
<div className="tsv2-info-card">
  <div className="tsv2-info-card__icon">{Icons.user}</div>
  <div>
    <div className="tsv2-info-card__label">CLIENT</div>
    <div className="tsv2-info-card__value">John Doe</div>
    <div className="tsv2-info-card__sub">Medicaid #12345</div>
  </div>
</div>
```

### Auth Card (PCA Form)

```jsx
<div className="pcaf-auth-card">
  <div className="pcaf-auth-card__left">
    <div className="pcaf-auth-card__title">AUTHORIZED SERVICES</div>
    <div className="pcaf-auth-card__sub">Per week</div>
  </div>
  <div className="pcaf-auth-card__badges">
    <span className="pcaf-auth-pill pcaf-auth-pill--pas">PAS: 28 units</span>
    <span className="pcaf-auth-pill pcaf-auth-pill--hm">HM: 12 units</span>
  </div>
  <div className="pcaf-auth-card__right">
    <div className="pcaf-auth-card__total-label">TOTAL THIS WEEK</div>
    <div className="pcaf-auth-card__total-value">6.5 hrs</div>
  </div>
</div>
```

Auth pill colors: `--pas` (blue), `--hm` (green), `--respite` (orange).

### Insurance Type Card

```jsx
<div className="it-grid">
  <div className="it-card">
    <div className="it-card__color" style={{background: '#3b82f6'}} />
    <div className="it-card__info">
      <div className="it-card__name">Medicare</div>
      <div className="it-card__hex">#3b82f6</div>
    </div>
    <div className="it-card__actions">{/* edit/delete */}</div>
  </div>
</div>
```

---

## Badges & Status

### Timesheet Status Badges

```jsx
<span className={`ts-badge ${ts.isOverdue ? 'ts-badge--overdue' : `ts-badge--${ts.status}`}`}>
  {ts.isOverdue ? 'Overdue' : ts.status}
</span>
```

| Class | Background | Text |
|-------|-----------|------|
| `ts-badge--draft` | `hsl(45 93% 94%)` | `hsl(32 95% 35%)` |
| `ts-badge--submitted` | `hsl(142 76% 92% / 0.12)` | `hsl(142 76% 30%)` |
| `ts-badge--accepted` | `hsl(210 100% 45% / 0.12)` | `hsl(210 100% 35%)` |
| `ts-badge--overdue` | `hsl(0 80% 95%)` | `hsl(0 72% 40%)` |
| `ts-badge--critical` | `hsl(0 84% 95%)` | `hsl(0 84% 40%)` + border |

### Status Cell (Authorization/Client)

```jsx
<span className={`status-cell status-cell--${color}`}>{label}</span>
```

Colors: `GREEN` (active), `YELLOW`/`ORANGE` (renewal), `RED` (expired).

### Compliance Indicator (Employees)

```jsx
<div className={`compliance-indicator compliance-indicator--${status}`}>
  {Icons.checkCircle} Up to date
</div>
```

Variants: `--success`, `--warning`, `--danger`.

---

## Tooltips (CSS Hover)

Pure CSS tooltips — no JavaScript library. Pattern:

```jsx
<span className="payroll-note-text--has-note">
  {truncatedText}
  <span className="payroll-note-tooltip">{fullText}</span>
</span>
```

```css
.tooltip-parent {
  position: relative;
}
.tooltip-child {
  display: none;
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  max-width: 240px;
  width: max-content;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 50;
  pointer-events: none;
}
.tooltip-parent:hover .tooltip-child { display: block; }
```

Used on: PayrollPage (notes), AuthorizationsPage (client notes).

---

## Tip / Info Banner

Informational banner with icon + text:

```jsx
<div className="pcaf-tip">
  <span className="pcaf-tip__icon">{Icons.helpCircle}</span>
  Tip text explaining something to the user.
</div>
```

Light card background, bordered, 13px muted text.

---

## Modal Forms

### Standard Modal

```jsx
<Modal onClose={handleClose}>
  <h2 className="modal__title">Modal Title</h2>
  <p className="modal__desc">Optional description</p>
  <form onSubmit={handleSubmit}>
    <div className="form-group">
      <label htmlFor="name">Label</label>
      <input id="name" type="text" value={val} onChange={handler} />
    </div>
    <div className="form-grid-2">
      <div className="form-group">{/* col 1 */}</div>
      <div className="form-group">{/* col 2 */}</div>
    </div>
    <div className="form-actions">
      <button className="btn btn--outline" type="button" onClick={handleClose}>Cancel</button>
      <button className="btn btn--primary" type="submit">Save</button>
    </div>
  </form>
</Modal>
```

- Default: 520px max-width
- Wide: add `wide` prop → 640px
- ESC closes, backdrop click closes, focus traps inside

### Confirm Modal

```jsx
<ConfirmModal
  title="Delete Client"
  message={`Are you sure you want to delete "${name}"?`}
  confirmLabel="Delete"
  confirmVariant="danger"
  onConfirm={handleDelete}
  onClose={() => setConfirm(null)}
/>
```

---

## Drawers

Right-side sliding panel for detail views:

```jsx
<DrawerPanel onClose={handleClose}>
  <div className="drawer-header">
    <h2 className="drawer-header__name">{name}</h2>
    <div className="drawer-header__meta">
      <span className="insurance-badge">{type}</span>
    </div>
  </div>
  <div className="drawer-section">
    <h3 className="drawer-section__title">Section</h3>
    <div className="drawer-field">
      <label className="drawer-field__label">Field</label>
      <input className="drawer-field__input" value={val} onChange={handler} />
    </div>
  </div>
</DrawerPanel>
```

400px width, slides in from right, ESC/backdrop closes.

---

## Date Inputs

### Standard Date

```jsx
<div className="form-group">
  <label>Start Date</label>
  <input type="date" value={date} onChange={handler} />
</div>
```

### Date Range

```jsx
<div className="ts-filter-bar__date-range">
  <input type="date" value={from} onChange={handler} />
  <span className="ts-filter-bar__date-sep">–</span>
  <input type="date" value={to} onChange={handler} />
</div>
```

### Week Picker (PCA Form)

```jsx
<div className="pcaf-topbar__week">
  <button className="pcaf-week-arrow" onClick={prevWeek}>{Icons.chevronLeft}</button>
  <input type="date" className="pcaf-week-input" value={sunday} onChange={handleWeekChange} />
  <button className="pcaf-week-arrow" onClick={nextWeek}>{Icons.chevronRight}</button>
</div>
<div className="pcaf-topbar__week-range">May 25 – May 31, 2026</div>
```

Date snaps to Sunday via `getSunday()`.

---

## Selects & Dropdowns

### Standard Select

```jsx
<select value={val} onChange={handler}>
  <option value="">— Select —</option>
  {options.map(o => <option key={o} value={o}>{o}</option>)}
</select>
```

### Searchable Select

```jsx
<SearchableSelect
  options={[{value: '1', label: 'Option 1'}, ...]}
  value={selected}
  onChange={setSelected}
  placeholder="Type to search..."
/>
```

Dropdown appears on focus/type, filters options, click-outside closes.

### Multi-select Checkboxes

```jsx
<div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
  {services.map(svc => (
    <label key={svc} style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}}>
      <input type="checkbox" checked={enabled.includes(svc)} onChange={() => toggle(svc)} />
      {svc}
    </label>
  ))}
</div>
```

---

## Inline Editing

Click-to-edit pattern used in Payroll tables:

```jsx
// Read mode
<span
  onClick={() => setEditing(true)}
  style={{cursor: 'pointer', borderBottom: '1px dashed hsl(var(--border))'}}
  title="Click to edit"
>
  {displayValue}
</span>

// Edit mode
<input
  value={draft}
  onChange={e => setDraft(e.target.value)}
  onBlur={commit}
  onKeyDown={e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  }}
  autoFocus
/>
```

---

## Bulk Selection

### Toolbar + Checkboxes

```jsx
<div className="table-toolbar">
  <div className="table-toolbar__left">
    <input type="checkbox" className="bulk-checkbox" checked={allSelected} onChange={toggleAll} />
    <span className="table-toolbar__selected">{count} selected</span>
    <select className="table-toolbar__select" value="" onChange={handleBulkAction}>
      <option value="">Bulk Actions</option>
      <option value="delete">Delete Selected</option>
    </select>
  </div>
  <div className="table-toolbar__right">
    {/* filters */}
  </div>
</div>

{/* In table rows */}
<td><input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggle(id)} /></td>
```

State: `selectedIds` as a `Set`.

---

## Expandable Rows

```jsx
<button
  className={`row-client__toggle ${isOpen ? 'row-client__toggle--open' : ''}`}
  onClick={() => toggleExpand(id)}
>
  {Icons.chevronRight}
</button>

{isOpen && children.map(child => (
  <tr className="row-auth">
    <td style={{paddingLeft: 36}}>└ {child.label}</td>
  </tr>
))}
```

State: `expandedIds` as a `Set`.

---

## Signature Pad

```jsx
<SignaturePad
  label="PCA Signature"
  value={signatureDataUrl}
  onChange={setSignature}
  disabled={isSubmitted}
/>
```

Canvas-based (400x120), mouse + touch, Clear button, disabled state.

---

## Search

### Simple (immediate filtering)

```jsx
<input
  type="text"
  className="search-input"
  placeholder="Search..."
  value={query}
  onChange={e => setQuery(e.target.value)}
/>
```

### Debounced (for large datasets like Payroll)

```jsx
const [search, setSearch] = useState('');
const [debounced, setDebounced] = useState('');

useEffect(() => {
  const t = setTimeout(() => setDebounced(search), 300);
  return () => clearTimeout(t);
}, [search]);
```

### Multi-field Filter Bar

```jsx
<div className="ts-filter-bar">
  <div className="ts-filter-bar__field">
    <label>Caregiver</label>
    <select>{/* options */}</select>
  </div>
  <div className="ts-filter-bar__field">
    <label>Status</label>
    <select>{/* options */}</select>
  </div>
  <div className="ts-filter-bar__actions">
    <button className="btn btn--outline btn--sm" onClick={reset}>Reset</button>
  </div>
</div>
```

---

## Feedback & States

### Toast Notifications

```jsx
showToast('Item saved successfully', 'success');
showToast('Something went wrong', 'error');
showUndoToast('Item archived', undoFn);
```

Variants: `success` (green), `error` (red), `info` (blue), `undo` (orange + undo button). Auto-dismiss 3s.

### Loading State

```jsx
<LoadingState rows={5} />
```

Skeleton pulse animation, gray gradient rows.

### Empty State

```jsx
<div className="empty-state">
  <div className="empty-state__icon">{Icons.fileText}</div>
  <div className="empty-state__title">No timesheets yet</div>
  <div className="empty-state__desc">Click "Add Timesheet" to create one.</div>
</div>
```

### Error State

```jsx
<ErrorState
  title="Failed to load"
  message={error.message}
  onRetry={fetchData}
/>
```

### Attention Section (Dashboard)

```jsx
const attentionItems = [];
if (count > 0) attentionItems.push({
  icon: Icons.alertTriangle,
  label: `${count} items need attention`,
  severity: 'destructive', // or 'warning'
  action: () => navigate('/page'),
});

{attentionItems.length > 0 && (
  <div className="attention-section">
    <div className="attention-section__header">{Icons.alertTriangle} Needs Attention</div>
    <div className="attention-section__items">
      {attentionItems.map((item, i) => (
        <div className={`attention-item attention-item--${item.severity}`} onClick={item.action}>
          <span className="attention-item__icon">{item.icon}</span>
          <span className="attention-item__label">{item.label}</span>
          <span className="attention-item__arrow">{Icons.chevronRight}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

---

## Wizard / Stepper

Multi-step form with progress indicators:

```jsx
<div className="wizard-steps">
  {steps.map((step, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <div className={`wizard-step-connector ${i <= current ? 'wizard-step-connector--completed' : ''}`} />
      )}
      <div className={`wizard-step ${i === current ? 'wizard-step--active' : ''} ${i < current ? 'wizard-step--completed' : ''}`}>
        <div className="wizard-step__circle">{i < current ? '✓' : i + 1}</div>
        <span className="wizard-step__label">{step.label}</span>
      </div>
    </Fragment>
  ))}
</div>
```

Circle colors: active = primary blue, completed = green (#16a34a), pending = border gray.

---

## Pagination

```jsx
<Pagination
  currentPage={page}
  totalPages={totalPages}
  onPageChange={setPage}
/>
```

Component renders page numbers, prev/next arrows. 25 items per page default.

---

## Icons

Available via `import Icons from '../components/common/Icons'`. Access as `Icons.iconName`:

clipboard, layoutDashboard, users, shieldCheck, fileText, settings, helpCircle, search, plus, download, edit, trash, checkCircle, alertCircle, trendingUp, trendingDown, chevronRight, chevronLeft, chevronDown, chevronUp, upload, table, user, logOut, share, copy, dollarSign, calendar, clock, alertTriangle, archive, rotateCcw, key, eye, eyeOff, heart, building, alertOctagon, folder, paperclip, moreVertical, externalLink, phone, mail, undo, menu, filter, x

---

## Do / Don't Rules

1. **Hooks before returns** — All `useState`, `useCallback`, `useEffect` must be declared BEFORE any conditional early return (`if (loading) return ...`). Violating this causes blank-screen crash.

2. **No inline position on sidebar** — Never add `style={{position: 'relative'}}` to the sidebar `<aside>` — it overrides CSS `position: fixed`.

3. **Dark header is default** — All new tables use `data-table--dark-header`. Never use bare `data-table` without it unless it's a compact/drawer table.

4. **Dark tabs on detail pages** — Tab bars on ClientDetailPage and EmployeeDetailPage use the dark gradient background matching the table header.

5. **State patterns** — Use `Set` for multi-select/expand tracking. Use `useMemo` for filtered/computed lists. Use `useCallback` for fetch functions.

6. **Toast not alert** — Never use `alert()` or `window.confirm()`. Use `showToast()` and `ConfirmModal`.

7. **Semantic colors** — Green = success/active, Yellow/Orange = warning/renewal, Red = error/expired/destructive. Never invent new status colors.

8. **Icons from Icons.jsx** — Never create inline SVGs. If an icon doesn't exist, add it to `Icons.jsx`.

9. **Form actions right-aligned** — `form-actions` uses `justify-content: flex-end`. Cancel before Submit.

10. **No `window.location` navigation** — Use React Router's `useNavigate()` for all navigation.
