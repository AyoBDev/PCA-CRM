# PCAlink Visual Refresh — Design Spec

**Date:** 2026-04-20
**Scope:** Visual-only refresh across the entire app. No layout or functionality changes.
**Principle:** Blue replaces dark navy for interactive elements. All functional colors, layouts, and behavior remain identical.

---

## 1. Color Palette

### Updated CSS Custom Properties (`:root`)

| Token | Current Value | New Value | Hex |
|-------|--------------|-----------|-----|
| `--primary` | `240 5.9% 10%` | `217 91% 60%` | `#2563EB` |
| `--primary-foreground` | `0 0% 98%` | `0 0% 100%` | `#FFFFFF` |
| `--accent` | `240 4.8% 95.9%` | `213 94% 95%` | `#EFF6FF` |
| `--accent-foreground` | `240 5.9% 10%` | `217 91% 40%` | `#1E40AF` |
| `--ring` | `240 5.9% 10%` | `217 91% 60%` | `#2563EB` |

### New Semantic Tokens

| Token | Value | Hex | Purpose |
|-------|-------|-----|---------|
| `--success` | `160 84% 39%` | `#059669` | Submit, finalize, send actions |
| `--success-foreground` | `0 0% 100%` | `#FFFFFF` | Text on success buttons |

### Unchanged Tokens

These stay exactly as they are:
- `--background`, `--foreground` (white / near-black)
- `--muted`, `--muted-foreground` (zinc grays)
- `--border`, `--input` (light borders)
- `--destructive`, `--destructive-foreground` (red)
- `--warning` (amber)
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`

---

## 2. Button Hierarchy

| Role | Class | Background | Text | Use Cases |
|------|-------|-----------|------|-----------|
| **Primary** | `.btn--primary` | `#2563EB` | White | Save, Create, Confirm, main CTA |
| **Success** | `.btn--success` | `#059669` | White | Submit Timesheet, Send Schedules, finalize |
| **Outline** | `.btn--outline` | White | `#2563EB` + blue border | Save Draft, Cancel, secondary |
| **Danger** | `.btn--danger` | `#DC2626` | White | Delete, Archive |
| **Ghost** | `.btn--ghost` | Transparent | `#2563EB` | Minor actions, links-as-buttons |

### Button Changes Summary

- `btn--primary`: dark navy → healthcare blue
- `btn--outline`: gray border → blue border + blue text
- `btn--success`: new class for green finalize buttons
- `btn--danger`: unchanged
- `btn--ghost`: text color follows new primary blue

---

## 3. Page-by-Page Changes

### 3.1 Login Page

- Card header: add a blue gradient bar at the top of `.login-card`
- Title: "NV Best PCA" → **"PCAlink"**
- Subtitle: "Authorization Tracking System" → **"Service Delivery Platform"**
- Login button: uses new `btn--primary` (blue)
- Shield icon: color updated to `#2563EB`
- Background gradient: keep current subtle gray gradient

### 3.2 Sidebar

- Header text: "NV Best PCA" → **"PCAlink"**
- Active nav item: blue background tint (`hsl(217 91% 60% / 0.1)`) + blue text
- Hover state: light blue tint (`hsl(217 91% 60% / 0.05)`)
- Active icon color: `#2563EB`
- Collapse toggle: follows new primary color
- Structure: completely unchanged

### 3.3 PCA Form (Timesheet) — Caregiver-facing

**Buttons:**
- "Save Progress": `btn--outline` (blue border, blue text — clearly visible)
- "Submit Timesheet": `btn--success` (green — stands out as finalize action)

**Validation on submit attempt:**
- Missing/incomplete fields get: `border: 2px solid hsl(var(--destructive))` + `background: hsl(0 84% 60% / 0.05)` (subtle red tint)
- Auto-scroll to the first invalid field
- Small red error text appears below each invalid field
- Only triggers on days that have been partially filled (blank days = no indicators)
- Clears when the user fills in the field

**Validation fields that highlight:**
- Time In / Time Out (when one is filled but not the other)
- PCA Initials (when activity or time exists for that day)
- Client Initials (when activity or time exists for that day)
- PCA Name / Recipient Name (when empty on submit)
- PCA Signature / Recipient Signature (when empty on submit)

**Other:**
- Section title bars (`.sdr-section-title`): keep current blue (`hsl(200 80% 45%)`) — already works
- Week navigation buttons: blue outline style
- Toast messages: keep current dark style
- Required `*` indicators: already exist, no change

### 3.4 Dashboard

- Stat card accent values: follow new `--primary` blue
- All action buttons: new blue primary
- Expiring authorization alerts: keep red/orange/yellow (functional)
- Recent payroll table: unchanged layout

### 3.5 Scheduling Page

- "Create Shift" button: blue primary
- "Send Schedules" button: green success
- Week navigation: blue outline
- Today column highlight: blue tint (`hsl(217 91% 60% / 0.08)`)
- Shift chips: keep per-service color coding (functional)
- Overlap indicators: keep red (functional)
- Filter dropdowns: blue focus ring

### 3.6 Payroll Page

- Tab active state: blue underline + blue text
- "Upload" button: blue primary
- "Needs Review" badge: keep purple (semantic)
- Void/overlap/incomplete row colors: keep as-is (functional)
- Inline edit focus: blue focus ring
- Authorization banners: keep green/red unit colors (functional)

### 3.7 Timesheets List

- Status badges: keep green (submitted) / orange (draft) — functional
- "Export PDF": blue outline
- View/Edit links: blue ghost
- Search/filter inputs: blue focus ring

### 3.8 Clients Page

- Authorization severity colors: keep red/orange/yellow/blue (functional)
- "Add Client": blue primary
- "Import": blue outline
- Row hover: subtle blue tint

### 3.9 Employees / Users / Settings

- "Add" / "Create": blue primary
- "Edit": blue ghost
- "Delete" / "Archive": red danger
- Toggle active states: blue

### 3.10 Schedule View (Public PCA Link)

- Week navigation: blue outline buttons
- "Today" button: blue outline
- Service badges: keep per-service colors
- Table header: subtle blue tint
- Today's row: light blue highlight

### 3.11 Schedule Confirm (Public)

- "Confirm" button: blue primary
- Status display: keep semantic colors

### 3.12 Notifications

- "Send" button: green success
- Status badges: keep semantic (sent=green, failed=red, pending=orange, confirmed=blue)

---

## 4. Toasts

Add colored left accent border by type:

| Type | Left Border | Current |
|------|------------|---------|
| Success | `#059669` green | Dark bg, no type distinction |
| Error | `#DC2626` red | Dark bg, no type distinction |
| Info | `#2563EB` blue | Dark bg, no type distinction |

Keep the dark foreground background. Just add a 4px left border for type clarity.

---

## 5. Global Interactive States

### Focus Ring
All focusable elements: `box-shadow: 0 0 0 2px hsl(217 91% 60% / 0.25)` (blue ring)

### Table Rows
- Header: subtle blue-gray tint
- Hover: `hsl(217 91% 60% / 0.04)`

### Links
- Default: `#2563EB`
- Hover: `#1E40AF` (darker blue)

---

## 6. Typography

No font changes. Keep Inter/system fonts. Keep all current font sizes, weights, and line heights.

---

## 7. What Does NOT Change

- All page layouts and component structure
- All routing (hash-based)
- All API calls and data flow
- All business logic and validation rules
- Sidebar dimensions (256px / 52px)
- Modal/dialog structure
- Table column order and content
- Payroll processing pipeline
- Authorization severity color system
- Service code color chips in scheduling
- Status badge color meanings
- Signature pad component
- Mobile responsive breakpoints
- Any JavaScript logic

---

## 8. Implementation Approach

1. Update CSS custom properties in `:root` (5 token changes + 2 new tokens)
2. Update `btn--success` class and add where missing
3. Update login page text and add header bar
4. Update sidebar header text and active state colors
5. Add validation highlighting to PcaFormPage
6. Add toast type variants
7. Update table header/hover tints
8. Change all "NV Best PCA" text references to "PCAlink"
9. Rebuild client, test all pages visually
