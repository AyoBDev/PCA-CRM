# PCAlink Design System

A comprehensive reference for the visual language, component library, and design patterns used across the PCAlink application.

---

## Foundation

### Brand Identity

- **Product**: PCAlink - Service Delivery Platform for PCA agencies
- **Personality**: Professional, clean, healthcare-grade
- **Visual Style**: Minimal borders, generous spacing, soft shadows, card-based layouts
- **Font**: Inter (Google Fonts) - weights 400, 500, 600, 700

---

## Color System

All colors use HSL notation for consistency and easy manipulation.

### Core Palette

| Token | HSL Value | Hex (approx) | Usage |
|-------|-----------|--------------|-------|
| `--primary` | `217 91% 60%` | `#4B8BF5` | Actions, links, active states |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--foreground` | `240 10% 3.9%` | `#0A0A0F` | Body text |
| `--background` | `0 0% 100%` | `#FFFFFF` | Page background |
| `--muted` | `240 4.8% 95.9%` | `#F4F4F5` | Subtle backgrounds |
| `--muted-foreground` | `240 3.8% 46.1%` | `#71717A` | Secondary text |
| `--border` | `240 5.9% 90%` | `#E4E4E7` | Borders, dividers |

### Semantic Colors

| Token | HSL Value | Background Token | Usage |
|-------|-----------|-----------------|-------|
| `--success` | `160 84% 39%` | `--success-bg: 142 76% 96%` | Active, OK, positive |
| `--warning` | `38 92% 50%` | `--warning-bg: 38 100% 96%` | Renewal, pending, caution |
| `--danger` | `0 84% 60%` | `--danger-bg: 0 93% 97%` | Expired, error, destructive |

### Sidebar Theme (Dark)

| Token | Value | Usage |
|-------|-------|-------|
| `--sidebar-bg` | `hsl(220 70% 14%)` | Sidebar background |
| `--sidebar-bg-hover` | `hsl(220 60% 20%)` | Hover state |
| `--sidebar-bg-active` | `hsl(220 60% 24%)` | Active nav item |
| `--sidebar-text` | `hsl(210 40% 80%)` | Default nav text |
| `--sidebar-text-active` | `hsl(0 0% 100%)` | Active/current text |
| `--sidebar-accent` | `hsl(217 91% 60%)` | Active indicator |

### Status Color Mapping

Used in tables, badges, and row indicators:

| Status | Dot Color | Background | Text Color | Left Border |
|--------|-----------|------------|------------|-------------|
| OK / Active | Green | `hsl(142 76% 96%)` | `hsl(160 84% 39%)` | `hsl(160 84% 45%)` |
| Warning / Renewal | Orange | `hsl(38 100% 96%)` | `hsl(38 92% 50%)` | `hsl(38 92% 50%)` |
| Expired / Danger | Red | `hsl(0 93% 97%)` | `hsl(0 84% 60%)` | `hsl(0 84% 60%)` |
| Default | Amber | - | - | `hsl(38 92% 60%)` |

### Service Code Colors

```
PCS      → #22c55e (green)
SDPC     → #8b5cf6 (purple)
S5125    → #3b82f6 (blue)
S5130    → #f59e0b (amber)
S5135    → #ec4899 (pink)
S5150    → #06b6d4 (cyan)
TIMESHEETS → #64748b (slate)
```

### Avatar Colors (rotation)

```
#3b82f6, #8b5cf6, #06b6d4, #10b981, #f59e0b,
#ef4444, #ec4899, #6366f1, #14b8a6, #f97316
```

Assigned by hashing the person's name.

---

## Typography

### Scale

| Name | Size | Weight | Usage |
|------|------|--------|-------|
| Page Title | 20px | 700 | Page hero headers |
| Section Title | 18px | 700 | Content headers |
| Modal Title | 17px | 600 | Dialog headings |
| Card Title | 15px | 600 | Sheet/card headers |
| Body | 13-14px | 400-500 | General content |
| Label | 13px | 500 | Form labels, descriptions |
| Small | 12px | 500 | Secondary info, badges |
| Caption | 11px | 600 | Table headers, timestamps |
| Micro | 10px | 600 | Tiny labels |

### Letter Spacing

- Page titles: `-0.02em`
- Table headers: `0.4px`
- Badge labels: `0.02em`

### Line Heights

- Default: `1.5`
- Headings: `1.2`
- Single-line elements: `1`

---

## Spacing

Base unit: **4px**

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps, icon margins |
| `sm` | 6-8px | Compact spacing, form gaps |
| `md` | 12px | Section padding, filter gaps |
| `lg` | 16px | Standard padding, card internal |
| `xl` | 20-24px | Page padding, large sections |
| `2xl` | 32px | Login card, hero sections |
| `3xl` | 40-48px | Vertical section breaks |

---

## Border Radius

| Value | Usage |
|-------|-------|
| `var(--radius)` / 8px | Default (cards, inputs, buttons) |
| 6px | Modals, some containers |
| 4px | Small badges, compact elements |
| 10px | Stat cards, page-hero icons |
| 16px | Login card, signing containers |
| 999px / 50% | Pills, avatars, fully rounded |

---

## Shadows

| Name | Value | Usage |
|------|-------|-------|
| Subtle | `0 1px 3px hsl(0 0% 0% / 0.04)` | Cards at rest |
| Small | `0 2px 8px hsl(var(--foreground) / 0.06)` | Hover states |
| Medium | `0 4px 12px hsl(var(--foreground) / 0.12)` | Toast, elevated |
| Large | `0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)` | Login card |
| Depth | `0 16px 70px hsl(var(--foreground) / 0.15)` | Modals |
| Focus | `0 0 0 2px hsl(var(--ring) / 0.1)` | Input focus rings |
| Dropdown | `0 4px 16px hsl(var(--foreground) / 0.08), 0 1px 3px hsl(var(--foreground) / 0.04)` | Menus |

---

## Layout

### App Shell

```
+--+-------------------------------+
|  |  Content Header (sticky)      |
| S|-------------------------------|
| I|                               |
| D|  Page Content                 |
| E|  (24px padding)              |
| B|                               |
| A|                               |
| R|                               |
+--+-------------------------------+
```

- **Sidebar**: Fixed left, 256px expanded / 52px collapsed
- **Main Content**: `margin-left: var(--sidebar-width)`, flex: 1
- **Content Header**: Sticky top, border-bottom, z-index 10
- **Page Content**: 24px padding all sides

### Page Hero Header

```
+-----------------------------------------------------+
| [Icon]  Title                    [Search] [Actions]  |
|         Subtitle                                     |
+-----------------------------------------------------+
```

- Icon: 44px square, 10px radius, primary color at 10% opacity
- Title: 20px, 700 weight
- Subtitle: 13px, muted foreground
- Search: 280px width, 9px 14px padding

### Responsive Breakpoints

| Breakpoint | Changes |
|------------|---------|
| 1200px | Stats grid: 4 cols -> 2 cols |
| 900px | Calendar grid adjustments |
| 768px | Sidebar hidden, modal 96% width |
| 700px | Drawer panel full width |
| 480px | Signing form stacks vertically |

---

## Components

### Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| Primary | `hsl(--primary)` | White | None | Main actions |
| Outline | White | Primary | Primary border | Secondary actions |
| Ghost | Transparent | Primary | None | Tertiary/inline |
| Danger | `hsl(--danger)` | White | None | Destructive |
| Danger Ghost | Transparent | Red | None | Inline delete |
| Success | Green | White | None | Positive confirm |
| Restore | Green bg 10% | Green | None | Undo delete |

**Sizes:**
- Default: 8px 16px padding, 13px font
- Small (`--sm`): 6px 12px, 12px font
- Extra Small (`--xs`): 4px 8px, 12px font
- Icon (`--icon`): 6px padding, 32x32px

**States:**
- Hover: Slight background shift, scale(1.01)
- Focus: 2px outline offset
- Disabled: 0.5 opacity, no pointer events

### Cards (Stat Cards)

```
+-----------------------------------+
| Title              [Trend Badge]  |
| 128                               |
| Description text                  |
+-----------------------------------+
```

- 10px radius, 20px 24px padding
- Hover: shadow increase + translateY(-1px)
- Value: 28px, 700 weight
- Trend badge: 11px, pill-shaped, color-coded

### Data Tables

**Structure:**
```
+---+--------+----------+--------+--------+--------+---------+
| ☐ | Name   | ID       | Type   | Status | Days   | Actions |
+---+--------+----------+--------+--------+--------+---------+
| █ | [Av] ▸ Name | 000123 | BADGE | ● OK  | 223    | ✎ ⋮    |
+---+--------+----------+--------+--------+--------+---------+
```

- **Header**: 11px uppercase, muted, sticky, light gray bg (`hsl(220 20% 97%)`)
- **Header icons**: 14px inline SVGs with sort arrows
- **Rows**: 14px vertical padding, hover bg change
- **Left border**: 3px color indicator (status-based)
- **Avatar**: 34px circle, colored, initials

### Filter Pills

```
[ ● All  217 ] [ ● OK  198 ] [ ● Renewal  14 ] [ ● Expired  5 ]
```

- 7px 16px padding, 13px font, 999px radius
- Dot: 8px circle, currentColor
- Count: 20px pill, muted bg
- Active: Tinted background + colored text + count inverted

### Status Badges

```
● OK          → Green dot + green bg + green text
● Renewal     → Orange dot + orange bg + orange text
● Expired     → Red dot + red bg + red text
```

- 3px 10px padding, 11px font, 500 weight, 100px radius
- `::before` pseudo for 6px dot

### Insurance Badge

```
[ MEDICAID ]
```

- Blue themed: `hsl(213 94% 95%)` bg, `hsl(217 91% 50%)` text
- 3px 12px padding, 11px font, 600 weight
- 100px radius (full pill)

### Pagination

```
Showing 1 to 10 of 217 clients    [<] 1 2 3 ... 25 [>]  Rows per page [10 ▾]
```

- Page buttons: 32x32px, 13px font
- Active: Primary bg, white text
- Arrows: 32x32px bordered buttons
- Info: 13px, muted foreground

### Modals

- Backdrop: Fixed, 50% opacity foreground, blur(1px), z-100
- Container: 92% width, max 520px (640px wide), 32px padding
- Title: 17px, 600 weight
- Description: 13px, muted, 20px bottom margin
- Entry animation: scale 0.96 + translateY(4px), 0.2s ease

### Drawer Panel

- 400px width (700px+ full on mobile)
- Slide-in from right, 0.2s ease-out
- 24px padding, sections separated by borders
- Close button: top-right

### Forms

- Labels: 13px, 500 weight, 6px bottom margin
- Inputs: Full width, 8px 12px padding, border radius 8px
- Focus: Blue border + 2px ring shadow at 15% opacity
- Grid: 2-column with 12px gap
- Actions row: Flex end, 8px gap, top border, 24px top margin

### Toast Notifications

- Fixed bottom-right, 12px 16px padding
- 3px left border color-coded (success/error/info)
- Auto-dismiss with progress bar
- Entry: slide up 8px, 0.25s

### Empty States

```
        [Icon]
     No data yet
  Use import or add new
```

- Center-aligned, 60px vertical padding
- Icon: 48px, muted bg circle
- Title: 15px, 600 weight
- Description: 13px, muted

### Skeleton Loading

- Gradient pulse animation (200% width sweep)
- 42px height for table rows
- 1.5s infinite cycle

### Three-Dot Menu

- Trigger: 28x28px icon button
- Dropdown: 160px min-width, 4px padding, shadow
- Items: 8px 12px padding, 13px font, hover bg
- Separator: 1px border with 4px margin
- Z-index: 999 (above table overflow)

### Client Avatar

- 34px circle, colored background (hash-based)
- 12px white text, 600 weight
- Shows first + last initials

---

## Patterns

### Page Structure

Every admin page follows this pattern:

```jsx
<>
  <PageHero />        {/* or ContentHeader */}
  <div className="page-content">
    <StatsGrid />     {/* optional */}
    <SheetCard>
      <FilterPills />
      <Table />
      <PaginationBar />
    </SheetCard>
  </div>
  <Modals />
  <Drawers />
</>
```

### Table Row Interactions

1. **Click row** -> Open detail drawer
2. **Click checkbox** -> Select for bulk actions
3. **Click expand arrow** -> Show child rows (authorizations)
4. **Click edit icon** -> Open edit modal
5. **Click 3-dot menu** -> Show status/action dropdown

### Status Color System

Authorization status uses a 4-level color system:

| Level | Color | Left Border | Conditions |
|-------|-------|-------------|------------|
| BLUE | Green | `hsl(160 84% 45%)` | All OK, days > 60 |
| YELLOW | Amber | `hsl(38 92% 50%)` | Warning range (30-60 days) |
| ORANGE | Orange | `hsl(38 92% 50%)` | Renewal reminder (< 30 days) |
| RED | Red | `hsl(0 84% 60%)` | Expired or inactive |

### Form Validation UX

- Required fields: HTML5 `required` attribute
- Error display: Toast notification (red variant)
- Success display: Toast notification (green variant)
- Save-in-progress: Button shows "Saving..." with disabled state

### Navigation

- Sidebar: Icon + text (collapsed = icon only)
- Active state: White text + blue left accent
- Sub-navigation: Indented items under parent sections
- Badge count: Notification dot on sidebar items

---

## Animation

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| `dialogIn` | 0.2s | ease | Modal entry |
| `fadeIn` | 0.15s | ease | Backdrop |
| `drawer-slide-in` | 0.2s | ease-out | Drawer panels |
| `toastIn` | 0.25s | ease | Toast entry |
| `skeleton-pulse` | 1.5s | infinite | Loading skeleton |
| Hover transitions | 0.15s | ease | Buttons, rows, cards |
| Sidebar collapse | 0.2s | ease | Width transition |

---

## Icon System

All icons are inline SVGs from the Lucide icon set, defined in `components/common/Icons.jsx`.

**Standard sizing:**
- Navigation: 18x18px
- Table headers: 14x14px
- Buttons: 16x16px (inherits from parent)
- Status indicators: 6-8px dots

**Available icons:** clipboard, layoutDashboard, users, shieldCheck, fileText, settings, search, plus, download, upload, edit, trash, chevronRight, chevronLeft, chevronDown, trendingUp, trendingDown, alertCircle, checkCircle, calendar, clock, archive, rotateCcw, filter, list, paperclip, table, eye, link, send, printer, mail, phone, mapPin, heart, activity

---

## File Structure

```
client/src/
├── index.css              # All styles (8200+ lines, single source of truth)
├── App.jsx                # Router + lazy page imports
├── api.js                 # API client (named exports per endpoint)
├── main.jsx               # React entry point
├── components/
│   ├── common/
│   │   ├── Icons.jsx          # SVG icon library (25+ icons)
│   │   ├── Modal.jsx          # Modal wrapper
│   │   ├── ConfirmModal.jsx   # Confirmation dialog
│   │   ├── DrawerPanel.jsx    # Right-side slide panel
│   │   ├── ActivityDrawer.jsx # Audit log viewer
│   │   ├── Pagination.jsx     # Pagination controls
│   │   ├── SearchableSelect.jsx
│   │   └── SignaturePad.jsx
│   └── layout/
│       ├── Layout.jsx         # App wrapper (sidebar + main)
│       ├── Sidebar.jsx        # Navigation sidebar
│       └── Toast.jsx          # Toast notifications
├── hooks/
│   ├── useAuth.js             # Auth context
│   └── useToast.js            # Toast context
├── utils/
│   ├── dates.js               # Date formatting
│   ├── time.js                # Time formatting (hhmm12)
│   └── status.js              # Status labels/classes
└── pages/                     # One file per page/route
```

---

## CSS Architecture

Single-file architecture (`index.css`) organized by section comments:

```
1. Design Tokens (:root)
2. Reset & Base Styles
3. Layout (App, Sidebar, Main Content)
4. Content Header
5. Search Input
6. Stats Grid & Cards
7. Buttons
8. Sheet Card & Data Tables
9. Row Styles (Client, Auth)
10. Badges & Status Cells
11. Days Cell
12. Animations & Keyframes
13. Action Buttons
14. Responsive Breakpoints
15. Scrollbar
16. Skeleton
17. Table Info Bar
18. Filter Bar & Pills
19. Pagination
20. [Page-specific sections...]
```

**Naming convention:** BEM-inspired with `--` for modifiers and `__` for elements:
```
.component
.component--variant
.component__element
.component__element--modifier
```

**Prefix patterns:**
- `btn--` → Buttons
- `card__` → Cards
- `sheet-` → Table containers
- `row-` → Table rows
- `filter-` → Filter controls
- `modal` → Modals
- `drawer-` → Drawers
- `form-` → Forms
- `ts-` → Timesheets
- `sched-` → Scheduling
- `payroll-` → Payroll
- `cp-` → Client profile/detail
- `cl-` → Clients list
- `pa-` → Programs & Auth tab
- `sdr-` → Service Delivery Row (PCA form)

---

## Usage Guidelines

### When to use each component

| Need | Component | Example |
|------|-----------|---------|
| Page-level metrics | Stats Grid + Cards | Dashboard totals |
| Tabular data | Sheet Card + Table | Client list, payroll |
| Filtering data | Filter Pills | Status filtering |
| CRUD forms | Modal + Form | Add/edit client |
| Detail view | Drawer Panel | Client details |
| Confirm action | Confirm Modal | Delete confirmation |
| User feedback | Toast | Success/error messages |
| Loading state | Skeleton rows | Table loading |
| No data | Empty State | First-time views |

### Do's

- Use semantic color tokens, not raw hex values
- Match the 8px spacing grid
- Use filter pills for status/category toggles
- Include pagination for any list > 10 items
- Add avatars for person entities
- Use left-border colors for row status
- Keep modals under 640px wide

### Don'ts

- Don't use more than 4 stat cards in a row
- Don't mix filter-btn and filter-pill on the same page
- Don't use inline styles for colors (use tokens)
- Don't skip hover states on interactive elements
- Don't use alerts/banners for routine info (use toasts)
- Don't nest modals
