# Certification Portfolio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the employee Certifications tab as a two-column portfolio — a cards grid (with status-colored progress bars + View/Upload/Replace) beside a persistent "Interactive Attachment Viewer" that renders the selected cert's document via the existing `DocViewer` — matching the approved mockup, and give the client Programs/Authorizations attachments the same persistent-viewer treatment.

**Architecture:** A pure `progressForCert()` helper computes each card's progress bar. `CertCard` (extracted from the current inline `renderCertCard`) renders one card. `CertViewerPanel` wraps `DocViewer` as the persistent right column. `CertificationsTab` owns `selectedCertId` and lays the two columns out; on narrow screens (via `useIsWide`) the viewer collapses and cards open the full-screen `PreviewModal`. The client tab reuses the same layout CSS + its existing shared `FilePreviewPane`.

**Tech Stack:** React 19 + Vite; vitest + @testing-library/react (client tests, `vi.fn()`), test files in `client/src/__tests__/*.test.jsx`, run `cd client && npx vitest run <path>`; `DocViewer`/`ToggleSwitch`/`PreviewModal`/`useIsWide` already exist.

## Global Constraints

- Reusable file components take `fetchBlob: () => Promise<Response>`. Never a URL or bare blob.
- **`DocViewer` is the single render engine** — the viewer panel wraps it and injects panel-specific buttons via `extraToolbarActions`; do NOT build a parallel zoom/page toolbar.
- pdf.js only via `lib/pdfThumbnail.js` (already inside DocViewer). Do not import `pdfjs-dist` directly.
- `fetchBlob` identities must be **stable across re-renders** (reuse the existing `certFetchBlobs` memoized Map in `CertificationsTab`) so `DocViewer` doesn't refetch on unrelated re-renders.
- Client tests: vitest + @testing-library/react. Mock `DocViewer`/`FileThumbnail` in component tests to avoid pdf.js.
- **NEW controls use `<Tooltip>` / `<ToggleSwitch>`**, not native `title=` (project standard). The `ToggleSwitch` (`common/ToggleSwitch.jsx`) already exists.
- Preserve existing cert behavior: upload modal (`setShowUploadModal(ct.type)` / `onEdit`), status computation (`getCertStatusForType`), `CERT_COLORS`, audit — do not regress.
- After frontend changes: `cd client && npm run build` must pass (restore `client/dist` with `git checkout -- client/dist` if dirtied). Dev server on 5173 hot-reloads.
- Filter set: **All / Active / Expiring / Missing / Expired** (internal values `All / OK / Critical / Missing / Expired`).

---

### Task 1: `progressForCert()` helper

**Files:**
- Create: `client/src/utils/certProgress.js`
- Test: `client/src/__tests__/certProgress.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `progressForCert({ status, days, renewalYears, hasFile }): { pct: number, variant: 'active'|'expiring'|'expired'|'notset'|'complete' }`.
  - `pct` is 0–100. `variant` drives the bar color.
  - Rules: `status === 'expired'` → `{ pct: 0, variant: 'expired' }`. Not-set (no expiry / `days == null`) → `{ pct: 15, variant: 'notset' }` (short indeterminate bar). Completed one-time (`renewalYears == null && hasFile && status !== 'expired' && days == null`) is covered by not-set unless caller passes a `complete` flag — keep it simple: treat `days == null && hasFile` as `{ pct: 100, variant: 'complete' }`. Dated & active/expiring: `windowDays = (renewalYears ? renewalYears*365 : Math.max(days, 1))`; `pct = clamp(round(days / windowDays * 100), 0, 100)`; `variant = status === 'critical' ? 'expiring' : 'active'`.

- [ ] **Step 1: Write the failing test**

```js
// client/src/__tests__/certProgress.test.js
import { describe, it, expect } from 'vitest';
import { progressForCert } from '../utils/certProgress';

describe('progressForCert', () => {
  it('active dated cert → proportional pct, active variant', () => {
    const r = progressForCert({ status: 'ok', days: 182, renewalYears: 1, hasFile: true });
    expect(r.variant).toBe('active');
    expect(r.pct).toBeGreaterThan(40); expect(r.pct).toBeLessThan(60);
  });
  it('expiring cert → expiring variant', () => {
    expect(progressForCert({ status: 'critical', days: 20, renewalYears: 1, hasFile: true }).variant).toBe('expiring');
  });
  it('expired cert → 0 pct, expired variant', () => {
    expect(progressForCert({ status: 'expired', days: -5, renewalYears: 1, hasFile: true })).toEqual({ pct: 0, variant: 'expired' });
  });
  it('not-set cert (no expiry) → notset variant, short bar', () => {
    const r = progressForCert({ status: 'unset', days: null, renewalYears: 2, hasFile: false });
    expect(r.variant).toBe('notset'); expect(r.pct).toBeGreaterThan(0); expect(r.pct).toBeLessThan(30);
  });
  it('completed one-time (no expiry, has file) → complete, full bar', () => {
    expect(progressForCert({ status: 'ok', days: null, renewalYears: null, hasFile: true })).toEqual({ pct: 100, variant: 'complete' });
  });
  it('clamps pct to 0..100', () => {
    expect(progressForCert({ status: 'ok', days: 99999, renewalYears: 1, hasFile: true }).pct).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/certProgress.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// client/src/utils/certProgress.js
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

export function progressForCert({ status, days, renewalYears, hasFile }) {
    if (status === 'expired') return { pct: 0, variant: 'expired' };
    if (days == null) {
        if (hasFile) return { pct: 100, variant: 'complete' };
        return { pct: 15, variant: 'notset' };
    }
    const windowDays = renewalYears ? renewalYears * 365 : Math.max(days, 1);
    const pct = clamp(Math.round((days / windowDays) * 100), 0, 100);
    return { pct, variant: status === 'critical' ? 'expiring' : 'active' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/certProgress.test.js`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/certProgress.js client/src/__tests__/certProgress.test.js
git commit -m "feat(certs): progressForCert helper for portfolio progress bars"
```

---

### Task 2: `CertViewerPanel` component

**Files:**
- Create: `client/src/components/common/CertViewerPanel.jsx`
- Modify: `client/src/index.css`
- Test: `client/src/__tests__/CertViewerPanel.test.jsx`

**Interfaces:**
- Consumes: `DocViewer` (`{ fileName, fetchBlob, extraToolbarActions }`), `Icons`.
- Produces: default export `CertViewerPanel`, props:
  - `fileName?: string`
  - `fetchBlob?: () => Promise<Response>`
  - `status?: string` (badge label)
  - `statusClass?: string` (badge class suffix, e.g. `submitted`/`critical`/`draft`)
  - `onHistory?: () => void`
  - `onReplace?: () => void`
  - `emptyText?: string` (default: `'Select a certification to preview its document.'`)
  - Renders the panel header (title "Interactive Attachment Viewer" + subtitle), the selected file name + status badge, and `<DocViewer>` with History + Replace/Upload buttons injected via `extraToolbarActions`. When no `fetchBlob`, renders only the empty state.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/CertViewerPanel.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CertViewerPanel from '../components/common/CertViewerPanel';

vi.mock('../components/common/DocViewer', () => ({ default: ({ fileName, extraToolbarActions }) => (
  <div data-testid="docviewer">{fileName}{extraToolbarActions}</div>
) }));

describe('CertViewerPanel', () => {
  it('shows the empty state when no file is selected', () => {
    render(<CertViewerPanel />);
    expect(screen.getByText(/select a certification/i)).toBeInTheDocument();
    expect(screen.queryByTestId('docviewer')).not.toBeInTheDocument();
  });

  it('renders the selected file name + DocViewer', () => {
    render(<CertViewerPanel fileName="cpr.pdf" fetchBlob={vi.fn()} status="Active" statusClass="submitted" />);
    expect(screen.getByTestId('docviewer')).toHaveTextContent('cpr.pdf');
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('fires onHistory and onReplace from the toolbar actions', () => {
    const onHistory = vi.fn(), onReplace = vi.fn();
    render(<CertViewerPanel fileName="cpr.pdf" fetchBlob={vi.fn()} onHistory={onHistory} onReplace={onReplace} />);
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    fireEvent.click(screen.getByRole('button', { name: /replace|upload/i }));
    expect(onHistory).toHaveBeenCalled();
    expect(onReplace).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/CertViewerPanel.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```jsx
// client/src/components/common/CertViewerPanel.jsx
import Icons from './Icons';
import DocViewer from './DocViewer';

export default function CertViewerPanel({
    fileName, fetchBlob, status, statusClass = 'draft', onHistory, onReplace,
    emptyText = 'Select a certification to preview its document.',
}) {
    return (
        <div className="cert-viewer">
            <div className="cert-viewer__head">
                <div>
                    <h3 className="cert-viewer__title">Interactive Attachment Viewer</h3>
                    <p className="cert-viewer__subtitle">Clear in-app document preview. Downloading is optional.</p>
                </div>
            </div>
            {fetchBlob ? (
                <>
                    <div className="cert-viewer__filebar">
                        <span className="cert-viewer__filename">{Icons.fileText} {fileName}</span>
                        {status && <span className={`ts-badge ts-badge--${statusClass}`}>{status}</span>}
                    </div>
                    <div className="cert-viewer__body">
                        <DocViewer
                            fileName={fileName}
                            fetchBlob={fetchBlob}
                            extraToolbarActions={(
                                <>
                                    {onHistory && <button className="doc-viewer__tool" onClick={onHistory} title="History" aria-label="History">{Icons.history}</button>}
                                    {onReplace && <button className="doc-viewer__tool" onClick={onReplace} title="Replace / Upload" aria-label="Replace / Upload">{Icons.upload}</button>}
                                </>
                            )}
                        />
                    </div>
                </>
            ) : (
                <div className="cert-viewer__empty">{emptyText}</div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Add CSS**

In `index.css` (near `.file-preview-pane*`):

```css
.cert-viewer { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.cert-viewer__head { padding: 4px 4px 12px; }
.cert-viewer__title { font-size: 16px; font-weight: 700; color: hsl(var(--foreground)); margin: 0; }
.cert-viewer__subtitle { font-size: 12px; color: hsl(var(--muted-foreground)); margin: 2px 0 0; }
.cert-viewer__filebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid hsl(var(--border)); border-radius: var(--radius); margin-bottom: 12px; }
.cert-viewer__filename { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; min-width: 0; }
.cert-viewer__filename svg { width: 16px; height: 16px; flex-shrink: 0; }
.cert-viewer__body { flex: 1 1 auto; min-height: 420px; height: 60vh; }
.cert-viewer__empty { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; min-height: 320px; color: hsl(var(--muted-foreground)); font-size: 13px; border: 1px dashed hsl(var(--border)); border-radius: var(--radius); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/CertViewerPanel.test.jsx`
Expected: PASS (3).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/common/CertViewerPanel.jsx client/src/index.css client/src/__tests__/CertViewerPanel.test.jsx
git commit -m "feat(certs): CertViewerPanel — persistent DocViewer panel with history/replace"
```

---

### Task 3: `CertCard` component (extracted + enriched with progress bar)

**Files:**
- Create: `client/src/components/employee/CertCard.jsx`
- Modify: `client/src/index.css`
- Test: `client/src/__tests__/CertCard.test.jsx`

**Interfaces:**
- Consumes: `Icons`, `progressForCert` (Task 1), `formatDate` from `utils/dates`.
- Produces: default export `CertCard`, props:
  - `label: string`, `icon: ReactNode`, `colors: { accent, bg, border }`
  - `status: 'ok'|'critical'|'expired'|'unset'`, `statusLabel: string`, `days: number|null`, `expDate: string|null`, `renewalLabel: string` (e.g. `'1 year'`, `'Per ID date'`, `'Not required'`)
  - `hasFile: boolean`, `selected: boolean`
  - `onSelect: () => void`, `onView: () => void`, `onUpload: () => void`
  - Renders icon tile, name, status badge, expiry + days-remaining line, a **progress bar** (`progressForCert` → width % + `cert-card__progress--{variant}`), the Renewal row, and **View** + (**Replace** if `hasFile` else **Upload**) buttons. Clicking the card body calls `onSelect`; View calls `onView`; Upload/Replace calls `onUpload`. `selected` adds `is-selected`.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/CertCard.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CertCard from '../components/employee/CertCard';

const base = {
  label: 'CPR & First Aid', icon: <svg/>, colors: { accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  status: 'ok', statusLabel: 'Active', days: 288, expDate: '2027-05-27', renewalLabel: '2 years',
  onSelect: vi.fn(), onView: vi.fn(), onUpload: vi.fn(),
};

describe('CertCard', () => {
  it('renders name, status, expiry, renewal', () => {
    render(<CertCard {...base} hasFile selected={false} />);
    expect(screen.getByText('CPR & First Aid')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/2 years/)).toBeInTheDocument();
  });
  it('shows Replace when a file exists, Upload when not', () => {
    const { rerender } = render(<CertCard {...base} hasFile selected={false} />);
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    rerender(<CertCard {...base} hasFile={false} selected={false} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });
  it('fires onSelect on card click and onView on View', () => {
    render(<CertCard {...base} hasFile selected={false} />);
    fireEvent.click(screen.getByText('CPR & First Aid'));
    expect(base.onSelect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(base.onView).toHaveBeenCalled();
  });
  it('adds is-selected when selected', () => {
    const { container } = render(<CertCard {...base} hasFile selected />);
    expect(container.querySelector('.cert-card.is-selected')).toBeInTheDocument();
  });
  it('renders a progress bar element', () => {
    const { container } = render(<CertCard {...base} hasFile selected={false} />);
    expect(container.querySelector('.cert-card__progress')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/CertCard.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```jsx
// client/src/components/employee/CertCard.jsx
import { progressForCert } from '../../utils/certProgress';
import { formatDate } from '../../utils/dates';

export default function CertCard({
    label, icon, colors, status, statusLabel, days, expDate, renewalLabel,
    hasFile, selected, onSelect, onView, onUpload,
}) {
    const { pct, variant } = progressForCert({ status, days, renewalYears: renewalLabel && /year/.test(renewalLabel) ? parseInt(renewalLabel, 10) : (expDate ? 1 : null), hasFile });
    const badgeStyle =
        status === 'ok' ? { background: 'hsl(142 76% 92%)', color: '#16a34a' } :
        status === 'critical' ? { background: 'hsl(38 92% 92%)', color: '#d97706' } :
        status === 'expired' ? { background: 'hsl(0 84% 94%)', color: '#dc2626' } :
        { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };

    const stop = (e, fn) => { e.stopPropagation(); fn(); };

    return (
        <div
            className={`cert-card${selected ? ' is-selected' : ''}`}
            style={{ '--card-accent': colors.accent, '--card-bg': colors.bg, '--card-border': colors.border }}
            role="button" tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
        >
            <div className="cert-card__header">
                <div className="cert-card__icon" style={{ background: colors.bg, color: colors.accent }}>{icon}</div>
                <div className="cert-card__title-area">
                    <h4 className="cert-card__title">{label}</h4>
                </div>
                <span className="pa-badge" style={badgeStyle}>{statusLabel}</span>
            </div>
            <div className="cert-card__meta">
                <div className="cert-card__expiry">{expDate ? `Expires ${formatDate(expDate)}` : 'No expiration date entered'}</div>
                <div className="cert-card__days">{days != null ? (days >= 0 ? `${days.toLocaleString()} days remaining` : `Expired ${Math.abs(days)} days ago`) : (hasFile ? 'Attachment on file' : 'Attachment required')}</div>
            </div>
            <div className="cert-card__progress">
                <div className={`cert-card__progress-fill cert-card__progress-fill--${variant}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="cert-card__renewal">
                <span className="cert-card__renewal-label">Renewal</span>
                <span className="cert-card__renewal-value">{renewalLabel}</span>
            </div>
            <div className="cert-card__actions">
                <button className="btn btn--outline btn--sm" onClick={(e) => stop(e, onView)}>View</button>
                <button className="btn btn--outline btn--sm" onClick={(e) => stop(e, onUpload)}>{hasFile ? 'Replace' : 'Upload'}</button>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Add CSS**

In `index.css`:

```css
.cert-card { border: 1px solid hsl(var(--border)); border-left: 4px solid var(--card-accent, hsl(var(--primary))); border-radius: 12px; background: hsl(var(--card)); padding: 16px; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; }
.cert-card:hover { box-shadow: 0 4px 14px hsl(0 0% 0% / 0.06); }
.cert-card.is-selected { box-shadow: 0 0 0 2px hsl(var(--primary)); }
.cert-card__header { display: flex; align-items: center; gap: 10px; }
.cert-card__icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cert-card__icon svg { width: 18px; height: 18px; }
.cert-card__title-area { flex: 1; min-width: 0; }
.cert-card__title { font-size: 14px; font-weight: 700; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cert-card__meta { margin: 12px 0 8px; }
.cert-card__expiry { font-size: 14px; font-weight: 600; color: hsl(var(--foreground)); }
.cert-card__days { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
.cert-card__progress { height: 6px; border-radius: 999px; background: hsl(var(--muted)); overflow: hidden; }
.cert-card__progress-fill { height: 100%; border-radius: 999px; }
.cert-card__progress-fill--active { background: #22c55e; }
.cert-card__progress-fill--expiring { background: #f59e0b; }
.cert-card__progress-fill--expired { background: #dc2626; }
.cert-card__progress-fill--notset { background: #8b5cf6; }
.cert-card__progress-fill--complete { background: #22c55e; }
.cert-card__renewal { display: flex; align-items: center; justify-content: space-between; margin: 12px 0; font-size: 13px; }
.cert-card__renewal-label { color: hsl(var(--muted-foreground)); }
.cert-card__renewal-value { font-weight: 600; }
.cert-card__actions { display: flex; gap: 8px; }
.cert-card__actions .btn { flex: 1; justify-content: center; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/CertCard.test.jsx`
Expected: PASS (5).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/employee/CertCard.jsx client/src/index.css client/src/__tests__/CertCard.test.jsx
git commit -m "feat(certs): CertCard with progress bar + View/Upload/Replace"
```

---

### Task 4: Rebuild `CertificationsTab` as the two-column portfolio

**Files:**
- Modify: `client/src/pages/EmployeeDetailPage.jsx` (`CertificationsTab` + `renderCertCard`)

**Interfaces:**
- Consumes: `CertCard` (Task 3), `CertViewerPanel` (Task 2), `useIsWide`, existing `PreviewModal`/`previewUpload`, `certFetchBlobs` map, `getCertStatusForType`, `CERT_COLORS`, `statusLabel`/`statusBadgeClass`, `setShowUploadModal`, `CERT_TYPES`.
- Produces: no exported interface; `selectedCertId` state + a portfolio layout.

- [ ] **Step 1: Add selection state + a renewal-label helper**

In `CertificationsTab`, add `const [selectedCertId, setSelectedCertId] = useState(null)`. Add a helper mapping a `ct` to a renewal label: `renewalYears ? \`${renewalYears} year${renewalYears>1?'s':''}\` : (ct.type === 'id_expiration' ? 'Per ID date' : 'Not required')`. Add the "Missing" filter option to the filter chips (value `Missing`) and extend `filteredTypes` to include a Missing predicate (a cert whose active record has no file, or no expiration where required).

- [ ] **Step 2: Auto-select the first cert with a file**

Add an effect: when certs load and `selectedCertId` is null, set it to the first `ct` (by `CERT_TYPES` order) whose active record has a `fileName`. Derive the selected cert's file + fetchBlob from `certFetchBlobs.get(\`cert:${activeRecord.id}\`)`.

- [ ] **Step 3: Replace the grid + expandable block with the portfolio**

Replace the `cp-card__body` content (the `pa-services-grid` + the `!loadingCerts && ...` expanded block) with:

```jsx
<div className="cert-portfolio">
    <div className="cert-portfolio__list">
        <div className="pa-services-grid">
            <div className="pa-services-grid__left">
                {filteredTypes.filter((_, i) => i % 2 === 0).map(ct => renderCertCard(ct))}
            </div>
            <div className="pa-services-grid__right">
                {filteredTypes.filter((_, i) => i % 2 === 1).map(ct => renderCertCard(ct))}
            </div>
        </div>
    </div>
    {wide && (
        <div className="cert-portfolio__viewer">
            <CertViewerPanel
                fileName={selected?.fileName}
                fetchBlob={selected?.fetchBlob}
                status={selected ? statusLabel(selected.status) : undefined}
                statusClass={selected ? statusBadgeClass(selected.status) : 'draft'}
                onReplace={() => selected && setShowUploadModal(selected.certType)}
                onHistory={() => selected && setHistoryFor(selected)}
            />
        </div>
    )}
</div>
```

where `const wide = useIsWide(1024)` and `selected` is the derived `{ certType, status, fileName, fetchBlob }` for `selectedCertId`.

- [ ] **Step 4: Rewrite `renderCertCard` to render `CertCard`**

Replace the body of `renderCertCard(ct)` so it computes `status/days/expDate` (via `getCertStatusForType`), the active record + `hasFile`, and returns:

```jsx
<CertCard
    key={ct.type}
    label={colors.label}
    icon={Icons[colors.icon]}
    colors={{ accent: colors.accent, bg: colors.bg, border: colors.border }}
    status={status}
    statusLabel={statusLabel(status)}
    days={days}
    expDate={expDate}
    renewalLabel={renewalLabelFor(ct)}
    hasFile={!!activeWithFile}
    selected={selectedCertId === ct.type}
    onSelect={() => setSelectedCertId(ct.type)}
    onView={() => wide ? setSelectedCertId(ct.type) : (activeWithFile ? setPreviewUpload({ fileName: activeWithFile.fileName, fetchBlob: certFetchBlobs.get(`cert:${activeWithFile.id}`) }) : setShowUploadModal(ct.type))}
    onUpload={() => setShowUploadModal(ct.type)}
/>
```

The old expandable per-card history UI is removed. History now opens from the viewer panel's History action: add `const [historyFor, setHistoryFor] = useState(null)` and render a `Modal` (reuse `common/Modal`) that, when `historyFor` is set, lists that cert's upload history as `CertFileRow`s (map `historyFor.uploads` exactly as the old expanded card did — `id`, `fileName`, `fileType`, `submittedAt`, `effectiveDate`/`expirationDate`, `fetchBlob` via `certFetchBlobs.get(\`upload:${u.id}\`)`), each with Preview (→ `setPreviewUpload`) and Download. `onHistory` on the viewer sets `historyFor` to the selected cert (with its uploads). If the selected cert has no uploads, show "No history for this certification." This preserves the existing history/preview behavior, just relocated from the card into a modal opened from the viewer.

- [ ] **Step 5: Manual verification**

Run: `cd client && npm run build`; restore dist; hard-refresh an employee's Certifications tab (e.g. Jie Feng).
Expected: two-column portfolio — cards with progress bars on the left, a persistent viewer on the right; selecting a card updates the viewer; Upload/Replace opens the upload modal; on a narrow window the viewer hides and View opens the full-screen modal. Filters (incl. Missing) narrow the grid.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/EmployeeDetailPage.jsx
git commit -m "feat(certs): two-column certification portfolio with persistent viewer"
```

---

### Task 5: Portfolio layout CSS + client-tab parity

**Files:**
- Modify: `client/src/index.css` (`.cert-portfolio*`)
- Modify: `client/src/pages/client-tabs/ProgramsAuthTab.jsx` (persistent-viewer layout when the switch is on)

**Interfaces:**
- Consumes: existing `authDocSplit` + shared `FilePreviewPane` on the client tab.
- Produces: `.cert-portfolio` two-column layout; the client tab's docked pane uses the same side-by-side treatment.

- [ ] **Step 1: Add `.cert-portfolio` CSS**

```css
.cert-portfolio { display: flex; gap: 20px; align-items: flex-start; }
.cert-portfolio__list { flex: 1 1 55%; min-width: 0; }
.cert-portfolio__viewer { flex: 1 1 45%; min-width: 0; position: sticky; top: 16px; align-self: flex-start; }
@media (max-width: 1023px) { .cert-portfolio { flex-direction: column; } .cert-portfolio__viewer { position: static; width: 100%; } }
```

- [ ] **Step 2: Client-tab parity**

In `ProgramsAuthTab.jsx`, when `authDocSplit` is on, ensure the auth cards + the shared `FilePreviewPane` render side-by-side (wrap them in a `.cert-portfolio`-style flex row, or reuse `.cert-portfolio` classes). The pane already exists; this is layout only. Keep the ToggleSwitch as the on/off control.

- [ ] **Step 3: Manual verification**

Run: `cd client && npm run build`; restore dist; check the client Programs/Authorizations tab: toggling the switch shows the viewer beside the auth cards, matching the employee portfolio look.

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css client/src/pages/client-tabs/ProgramsAuthTab.jsx
git commit -m "feat(certs): portfolio two-column layout + client auth tab parity"
```

---

### Task 6: Document + full regression

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

In the "File Preview & Thumbnails — Reusable Components" section, add `CertViewerPanel` (persistent DocViewer panel) and note the two-column "certification portfolio" pattern (cards grid + persistent viewer, ToggleSwitch-gated, `useIsWide` collapse to full-screen modal on narrow screens). Add `ToggleSwitch` to the shared-components index if not already present.

- [ ] **Step 2: Full client test + build**

Run: `cd client && npm test`
Expected: PASS — including `certProgress`, `CertCard`, `CertViewerPanel`, and all prior preview tests.

Run: `cd client && npm run build`; restore `client/dist`.
Expected: build succeeds; `pdf-*.js` still code-split.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document CertViewerPanel + certification portfolio pattern"
```
