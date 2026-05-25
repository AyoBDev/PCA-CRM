# DESIGN.md — PCAlink Design System

## Overview
Healthcare admin tool. Dark navy sidebar, white content area, blue accent. Calm, data-dense, professional. No decorative elements.

## Color Tokens

All colors defined as HSL values in `:root` CSS custom properties. Usage: `hsl(var(--token))`.

| Token | HSL | Usage |
|-------|-----|-------|
| `--primary` | 217 91% 60% | Buttons, links, active states |
| `--primary-foreground` | 0 0% 100% | Text on primary backgrounds |
| `--secondary` | 240 4.8% 95.9% | Secondary button backgrounds |
| `--muted` | 240 4.8% 95.9% | Disabled backgrounds, subtle fills |
| `--muted-foreground` | 240 3.8% 46.1% | Secondary text, descriptions |
| `--accent` | 213 94% 95% | Highlight backgrounds, hover states |
| `--accent-foreground` | 217 91% 40% | Text on accent backgrounds |
| `--destructive` | 0 84.2% 60.2% | Delete buttons, error states |
| `--border` | 240 5.9% 90% | Table borders, card borders, dividers |
| `--success` | 160 84% 39% | Positive indicators, confirmed states |
| `--success-bg` | 142 76% 96% | Success badge/pill backgrounds |
| `--warning` | 38 92% 50% | Pending items, renewal reminders |
| `--warning-bg` | 38 100% 96% | Warning badge/pill backgrounds |
| `--danger` | 0 84% 60% | Alias for destructive in semantic contexts |
| `--danger-bg` | 0 93% 97% | Error badge/pill backgrounds |

### Sidebar Tokens
| Token | Value | Usage |
|-------|-------|-------|
| `--sidebar-bg` | hsl(220 70% 14%) | Sidebar background |
| `--sidebar-bg-hover` | hsl(220 60% 20%) | Nav item hover |
| `--sidebar-bg-active` | hsl(220 60% 24%) | Active nav item |
| `--sidebar-text` | hsl(210 40% 80%) | Default nav text |
| `--sidebar-text-active` | hsl(0 0% 100%) | Active nav text |
| `--sidebar-text-muted` | hsl(215 30% 55%) | Section labels |
| `--sidebar-accent` | hsl(217 91% 60%) | Logo background, accents |

## Typography

- **Font**: Inter (Google Fonts), fallback: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
- **Base size**: 14px (`html { font-size: 14px }`)
- **Line height**: 1.5
- **Weights**: 400 (body), 500 (nav items, labels), 600 (headings, active states), 700 (page titles)

### Scale
| Element | Size | Weight |
|---------|------|--------|
| Page title (`.page-hero__title`) | 20px | 700 |
| Page subtitle | 13px | 400 |
| Section labels | 10px uppercase | 600 |
| Table headers | 12px uppercase | 600 |
| Body text | 14px (1rem) | 400 |
| Small text / descriptions | 12-13px | 400 |
| Button text | 13px | 500 |
| Stat card value | 28px | 700 |

## Spacing

No formal scale defined yet. Common values observed:
- `4px` — tight gaps (inline elements)
- `8px` — compact padding (pills, tags, small gaps)
- `12px` — standard padding (nav items, card inner)
- `16px` — section padding, card padding, grid gaps
- `24px` — section margins
- `48px` — page-level loading/empty state padding

Use `gap` for flex/grid layouts. Avoid margin for spacing between siblings when a parent gap works.

## Breakpoints

Standard breakpoints (use these for all new media queries):
- **sm**: 640px — mobile landscape / small tablet
- **md**: 768px — tablet portrait, sidebar becomes hamburger
- **lg**: 1200px — desktop, full sidebar + content
- **xl**: 1400px — wide desktop, expanded table layouts

```css
@media (max-width: 768px) { /* tablet and below */ }
@media (max-width: 640px) { /* mobile */ }
@media (max-width: 1200px) { /* below desktop */ }
```

## Border Radius

`--radius: 0.5rem` (8px) — used on cards, buttons, inputs, modals, nav items.

## Components

### Page Hero (`.page-hero`)
Every admin page starts with a page hero: icon + title + subtitle on the left, action buttons on the right. Sticky at top of content area.

### Stats Grid (`.stats-grid`)
Responsive 4-column grid of stat cards. Collapses to 2-col on tablet, 1-col on mobile.

### Sheet Table (`.sheet-table`)
Full-width data table. Navy header row (matches sidebar), white rows, 1px border between rows. Sortable columns via `.th-content` + `.th-sort`.

### Filter Bar (`.filter-bar`, `.ts-filter-bar`)
Inline form controls above tables for filtering/searching data.

### Buttons (`.btn`)
Variants: `--primary`, `--outline`, `--ghost`, `--success`, `--danger`, `--danger-ghost`, `--restore`. Sizes: default, `--sm`, `--xs`, `--icon`.

### Modal (`.modal`)
Centered overlay with backdrop. Max-width 480px (default) or 720px (`--wide`). Has header with title + close button, body, footer with actions.

### Empty State (`.empty-state`)
Centered block: icon + title + description + optional CTA button. Used when a list/table has no data.

### Sidebar (`.sidebar`)
Fixed left panel, 256px expanded / 52px collapsed. Dark navy background. Sections with labels, nav items with icons.

## Naming Convention

BEM: `.block__element--modifier`
- Block = component name (`.sidebar`, `.page-hero`, `.sheet-table`)
- Element = child part (`__title`, `__icon`, `__nav-item`)
- Modifier = variant (`--active`, `--collapsed`, `--wide`)

## Utility Classes

Semantic color utilities (use instead of inline styles):
```css
.text-success    { color: hsl(var(--success)); }
.text-warning    { color: hsl(var(--warning)); }
.text-destructive { color: hsl(var(--destructive)); }
.text-muted      { color: hsl(var(--muted-foreground)); }
.text-primary    { color: hsl(var(--primary)); }
.bg-success      { background: hsl(var(--success-bg)); }
.bg-warning      { background: hsl(var(--warning-bg)); }
.bg-danger       { background: hsl(var(--danger-bg)); }
```

## Patterns

### Conditional coloring
Use utility classes, not inline styles:
```jsx
// Good
<span className={count > 0 ? 'text-warning' : undefined}>{count}</span>

// Bad
<span style={{ color: count > 0 ? 'hsl(var(--warning))' : undefined }}>{count}</span>
```

### Loading states
Use the shared `<LoadingState />` component (skeleton rows). Never use plain "Loading..." text.

### Error states
Use the shared `<ErrorState />` component (message + retry button). Toast for transient errors only.

### Empty states
Use `.empty-state` block: icon + title + actionable description. Every list page must have one.
