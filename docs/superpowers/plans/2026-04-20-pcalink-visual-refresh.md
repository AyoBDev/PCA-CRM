# PCAlink Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a healthcare blue color palette and visual polish across the entire PCAlink app — CSS tokens, buttons, login branding, sidebar, PCA form validation, toasts, and table styling — with zero layout or functionality changes.

**Architecture:** All changes are CSS custom property updates + minimal JSX text edits. The color system flows from `:root` tokens so updating 5 tokens + adding 2 new ones cascades to every component that uses `var(--primary)`, `var(--accent)`, `var(--ring)`. The few components with hardcoded colors get individual CSS fixes. PCA form validation is the only new JS logic (field highlighting state + scroll-to-error).

**Tech Stack:** React 19, Vite, vanilla CSS custom properties

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/index.css` | Modify | `:root` tokens, button classes, sidebar active states, login card header bar, table tints, toast info type, focus ring |
| `client/src/pages/LoginPage.jsx` | Modify | Title → "PCAlink", subtitle → "Service Delivery Platform" |
| `client/src/components/layout/Sidebar.jsx` | Modify | Brand name → "PCAlink", sub → "Service Delivery" |
| `client/src/pages/PcaFormPage.jsx` | Modify | Submit button → `btn--success`, validation highlighting state + scroll-to-error |
| `client/src/pages/scheduling/ScheduleViewPage.jsx` | Modify | "NV Best PCA Services" → "PCAlink" |
| `client/index.html` | Modify | `<title>` → "PCAlink", meta description update |

---

### Task 1: Update CSS Design Tokens

**Files:**
- Modify: `client/src/index.css:9-44` (`:root` block)

- [ ] **Step 1: Update the `:root` custom properties**

In `client/src/index.css`, replace the `:root` block (lines 9–44) with updated tokens. Changes:
- `--primary`: `240 5.9% 10%` → `217 91% 60%`
- `--primary-foreground`: `0 0% 98%` → `0 0% 100%`
- `--accent`: `240 4.8% 95.9%` → `213 94% 95%`
- `--accent-foreground`: `240 5.9% 10%` → `217 91% 40%`
- `--ring`: `240 5.9% 10%` → `217 91% 60%`
- `--success`: `142 71% 45%` → `160 84% 39%`
- Add `--success-foreground: 0 0% 100%`

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 213 94% 95%;
  --accent-foreground: 217 91% 40%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 217 91% 60%;
  --radius: 0.5rem;

  /* Semantic colors */
  --success: 160 84% 39%;
  --success-foreground: 0 0% 100%;
  --success-bg: 142 76% 96%;
  --warning: 38 92% 50%;
  --warning-bg: 38 100% 96%;
  --danger: 0 84% 60%;
  --danger-bg: 0 93% 97%;

  /* Sidebar */
  --sidebar-width: 256px;
  --sidebar-collapsed-width: 52px;
  --sidebar-bg: hsl(240 4.8% 95.9%);
  --sidebar-border: hsl(var(--border));
}
```

- [ ] **Step 2: Update the CSS file comment at line 1-4**

Replace the opening comment:

```css
/* ─────────────────────────────────────────────
   PCAlink — Healthcare Design System
   Blue palette · Sidebar layout · Clean borders
   ───────────────────────────────────────────── */
```

- [ ] **Step 3: Verify the dev server renders with new blue primary**

Run: `cd client && npm run dev`

Open `http://localhost:5173` — the login button and sidebar active states should now be blue (`#2563EB`) instead of dark navy.

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css
git commit -m "style: update CSS tokens to healthcare blue palette"
```

---

### Task 2: Update Button Classes

**Files:**
- Modify: `client/src/index.css:468-501` (outline/ghost/success button rules)
- Modify: `client/src/index.css:3825-3833` (duplicate `.btn--success` at bottom of file)

- [ ] **Step 1: Update `.btn--outline` to use blue border and text**

In `client/src/index.css`, replace the `.btn--outline` block (lines 469–478):

```css
/* Outline */
.btn--outline {
  background: hsl(var(--background));
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.3);
}

.btn--outline:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
```

- [ ] **Step 2: Update `.btn--ghost` to use primary color**

Replace the `.btn--ghost` block (lines 481–490):

```css
/* Ghost */
.btn--ghost {
  background: transparent;
  color: hsl(var(--primary));
  border-color: transparent;
}

.btn--ghost:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
```

- [ ] **Step 3: Update the first `.btn--success` block (lines 493–501) to use the success token**

```css
/* Success (submit/finalize actions) */
.btn--success {
  background: hsl(var(--success));
  color: hsl(var(--success-foreground));
  border-color: hsl(var(--success));
}

.btn--success:hover {
  background: hsl(var(--success) / 0.9);
}
```

- [ ] **Step 4: Remove the duplicate `.btn--success` block at the bottom of the file (lines 3825–3833)**

Delete these lines entirely — the first definition now handles it:

```css
/* DELETE these lines: */
.btn--success {
    background: hsl(142 71% 35%);
    color: white;
    border: none;
    font-weight: 700;
}
.btn--success:hover {
    background: hsl(142 71% 30%);
}
```

- [ ] **Step 5: Verify buttons in the browser**

Open `http://localhost:5173`. Check:
- Login "Sign In" button is blue
- Sidebar "Sign Out" button has blue border and blue text
- Any outline buttons show blue styling

- [ ] **Step 6: Commit**

```bash
git add client/src/index.css
git commit -m "style: update button classes for healthcare blue hierarchy"
```

---

### Task 3: Update Login Page Branding

**Files:**
- Modify: `client/src/pages/LoginPage.jsx:34-35`
- Modify: `client/src/index.css:2133-2141` (`.login-card`)

- [ ] **Step 1: Update LoginPage.jsx text**

In `client/src/pages/LoginPage.jsx`, change lines 34–35:

```jsx
<h1 className="login-card__title">PCAlink</h1>
<p className="login-card__subtitle">Service Delivery Platform</p>
```

- [ ] **Step 2: Add blue gradient header bar to `.login-card` in CSS**

In `client/src/index.css`, replace the `.login-card` block (lines 2133–2141):

```css
.login-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 420px;
  padding: 40px;
  overflow: hidden;
  position: relative;
}

.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, hsl(var(--primary)), hsl(217 91% 70%));
}
```

- [ ] **Step 3: Verify login page shows "PCAlink" with blue header bar**

Open `http://localhost:5173/login`. Verify:
- Title says "PCAlink"
- Subtitle says "Service Delivery Platform"
- A thin blue gradient bar appears at the top of the card
- Sign In button is blue

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LoginPage.jsx client/src/index.css
git commit -m "style: update login page branding to PCAlink"
```

---

### Task 4: Update Sidebar Branding and Active States

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx:60-61`
- Modify: `client/src/index.css:171-180` (sidebar nav hover/active)

- [ ] **Step 1: Update Sidebar.jsx brand text**

In `client/src/components/layout/Sidebar.jsx`, change lines 60–61:

```jsx
<div className="sidebar__brand-name">PCAlink</div>
<div className="sidebar__brand-sub">Service Delivery</div>
```

- [ ] **Step 2: Update sidebar active/hover CSS**

In `client/src/index.css`, replace the `.sidebar__nav-item:hover` and `.sidebar__nav-item--active` blocks (lines 171–180):

```css
.sidebar__nav-item:hover {
  background: hsl(var(--primary) / 0.05);
  color: hsl(var(--primary));
}

.sidebar__nav-item--active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
}
```

- [ ] **Step 3: Verify sidebar shows "PCAlink" with blue active/hover states**

Open `http://localhost:5173/dashboard`. Verify:
- Sidebar header says "PCAlink" with "Service Delivery" subtitle
- Active nav item has blue text with light blue background tint
- Hovering nav items shows subtle blue tint

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout/Sidebar.jsx client/src/index.css
git commit -m "style: update sidebar branding and active states to blue"
```

---

### Task 5: Update Table Header and Hover Tints

**Files:**
- Modify: `client/src/index.css:669-681` (`.sheet-table th`)
- Modify: `client/src/index.css:2097-2118` (`.data-table th`, `.data-table tbody tr:hover`)

- [ ] **Step 1: Update `.sheet-table th` background**

In `client/src/index.css`, replace the `.sheet-table th` `background` property (line 675):

```css
.sheet-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--primary) / 0.04);
  border-bottom: 1px solid hsl(var(--border));
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 2;
}
```

- [ ] **Step 2: Update `.data-table th` and hover**

Replace `.data-table th` and `.data-table tbody tr:hover`:

```css
.data-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--primary) / 0.04);
  border-bottom: 2px solid hsl(var(--border));
  white-space: nowrap;
}

.data-table tbody tr:hover {
  background: hsl(var(--primary) / 0.04);
}
```

- [ ] **Step 3: Verify table headers have subtle blue tint**

Navigate to any page with tables (Clients, Timesheets, Users). Table headers should have a very subtle blue-gray tint instead of plain gray. Row hover should show the same subtle blue.

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css
git commit -m "style: update table headers and hover to subtle blue tint"
```

---

### Task 6: Update Toast Colors and Add Info Type

**Files:**
- Modify: `client/src/index.css:1107-1126` (toast type blocks)

- [ ] **Step 1: Update `.toast--success` to use the `--success` token and add `.toast--info`**

In `client/src/index.css`, replace the toast type blocks (lines 1107–1126):

```css
.toast--success {
  border-left: 3px solid hsl(var(--success));
}
.toast--success svg {
  color: hsl(var(--success));
}

.toast--error {
  border-left: 3px solid hsl(var(--destructive));
}
.toast--error svg {
  color: hsl(var(--destructive));
}

.toast--info {
  border-left: 3px solid hsl(var(--primary));
}
.toast--info svg {
  color: hsl(var(--primary));
}

.toast--undo {
  border-left: 3px solid hsl(35 80% 50%);
}
.toast--undo svg {
  color: hsl(35 80% 50%);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "style: update toast colors to use design tokens, add info type"
```

---

### Task 7: Update HTML Title and Meta

**Files:**
- Modify: `client/index.html:6-7`

- [ ] **Step 1: Update index.html**

In `client/index.html`, change lines 6–7:

```html
<meta name="description" content="PCAlink — Service Delivery Platform for PCA agencies. Manage timesheets, scheduling, and payroll." />
<title>PCAlink</title>
```

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "style: update HTML title and meta to PCAlink"
```

---

### Task 8: Update Remaining Text References

**Files:**
- Modify: `client/src/pages/scheduling/ScheduleViewPage.jsx:107`
- Modify: `client/src/pages/LoginPage.jsx:40` (email placeholder)

- [ ] **Step 1: Update ScheduleViewPage.jsx**

In `client/src/pages/scheduling/ScheduleViewPage.jsx`, change line 107:

```jsx
<p style={{ color: '#71717a', margin: 0, fontSize: 13 }}>
    PCAlink
</p>
```

- [ ] **Step 2: Update LoginPage email placeholder**

In `client/src/pages/LoginPage.jsx`, change line 40. Update the placeholder:

```jsx
<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" autoFocus required />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/scheduling/ScheduleViewPage.jsx client/src/pages/LoginPage.jsx
git commit -m "style: replace remaining NV Best PCA references with PCAlink"
```

---

### Task 9: PCA Form — Submit Button to Success + Validation Highlighting

**Files:**
- Modify: `client/src/pages/PcaFormPage.jsx:508-518` (button + validation display)
- Modify: `client/src/index.css` (add validation error classes)

This is the most complex task. It adds:
1. Green success button for Submit
2. Validation error state tracking
3. Red border + tint on invalid fields
4. Auto-scroll to first invalid field
5. Per-field error messages

- [ ] **Step 1: Add validation error CSS classes to `client/src/index.css`**

Add after the `.pca-form-hint` block (after line ~1988):

```css
/* ── PCA Form Validation ── */
.sdr-field-error {
  border: 2px solid hsl(var(--destructive)) !important;
  background: hsl(0 84% 60% / 0.05) !important;
}

.sdr-field-error-msg {
  font-size: 11px;
  color: hsl(var(--destructive));
  margin-top: 2px;
  text-align: center;
}

.sdr-sig-error .signature-pad__canvas {
  border-color: hsl(var(--destructive)) !important;
  background: hsl(0 84% 60% / 0.05) !important;
}

.sdr-name-error input {
  border: 2px solid hsl(var(--destructive)) !important;
  background: hsl(0 84% 60% / 0.05) !important;
}
```

- [ ] **Step 2: Add validation error state and field-level error computation to PcaFormPage.jsx**

In `client/src/pages/PcaFormPage.jsx`, add a `useRef` import and state for tracking attempted submit. Change line 1:

```jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
```

After the `const [toast, setToast] = useState('');` line (line 236), add:

```jsx
const [submitAttempted, setSubmitAttempted] = useState(false);
```

- [ ] **Step 3: Add `fieldErrors` computation**

After the existing `validationError` useMemo block (after line 344), add a new `fieldErrors` useMemo:

```jsx
const fieldErrors = useMemo(() => {
    if (!submitAttempted || !data) return {};
    const errors = {};
    if (!pcaFullName.trim()) errors.pcaFullName = 'PCA name required';
    if (!pcaSig) errors.pcaSig = 'PCA signature required';
    if (!recipientName.trim()) errors.recipientName = 'Recipient name required';
    if (!recipientSig) errors.recipientSig = 'Recipient signature required';
    for (let idx = 0; idx < entries.length; idx++) {
        const e = entries[idx];
        const sections = [];
        if (pasEnabled) sections.push('adl');
        if (hmEnabled) sections.push('iadl');
        if (respiteEnabled) sections.push('respite');
        for (const sec of sections) {
            const anyAct = hasActivity(e, sec);
            const anyInitials = e[`${sec}PcaInitials`] || e[`${sec}ClientInitials`];
            const anyTime = e[`${sec}TimeIn`] || e[`${sec}TimeOut`];
            if (anyAct || anyInitials || anyTime) {
                if (!e[`${sec}TimeIn`]) errors[`${idx}-${sec}-timeIn`] = 'Required';
                if (!e[`${sec}TimeOut`]) errors[`${idx}-${sec}-timeOut`] = 'Required';
                if (!e[`${sec}PcaInitials`]) errors[`${idx}-${sec}-pcaInitials`] = 'Required';
                if (!e[`${sec}ClientInitials`]) errors[`${idx}-${sec}-clientInitials`] = 'Required';
            }
        }
    }
    return errors;
}, [submitAttempted, data, entries, pcaFullName, pcaSig, recipientName, recipientSig, pasEnabled, hmEnabled, respiteEnabled]);
```

- [ ] **Step 4: Update `handleSubmit` to set `submitAttempted` and scroll to first error**

Replace the `handleSubmit` function (lines 380–392):

```jsx
const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (validationError) {
        showToast(validationError);
        // Scroll to first error field
        setTimeout(() => {
            const el = document.querySelector('.sdr-field-error, .sdr-name-error, .sdr-sig-error');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
        return;
    }
    setSubmitting(true);
    try {
        const resp = await api.updatePcaForm(token, buildPayload('submit'));
        setData(resp);
        setEntries(resp.timesheet.entries || []);
        setSubmitAttempted(false);
        showToast('Timesheet submitted!');
    } catch (err) {
        showToast(err.message);
    }
    setSubmitting(false);
};
```

- [ ] **Step 5: Pass `fieldErrors` to SectionBlock and update the signature/name section**

Update the `SectionBlock` component signature (line 57) to accept `fieldErrors`:

```jsx
function SectionBlock({ header, activities, section, entries, updateEntry, dailyHoursFn, disabled, sectionDisabled, onAddShift, onRemoveShift, respiteEnabled, isIadlSection, fieldErrors }) {
```

In the PCA Initials input row (around line 111), add the error class:

```jsx
<input type="text" className={`sdr-initials-input ${fieldErrors[`${i}-${section}-pcaInitials`] ? 'sdr-field-error' : ''}`} value={e[`${section}PcaInitials`] || ''} disabled={disabled} maxLength={4}
    onChange={(ev) => updateEntry(i, `${section}PcaInitials`, ev.target.value.toUpperCase())} />
```

In the Client Initials input row (around line 120), add the error class:

```jsx
<input type="text" className={`sdr-initials-input ${fieldErrors[`${i}-${section}-clientInitials`] ? 'sdr-field-error' : ''}`} value={e[`${section}ClientInitials`] || ''} disabled={disabled} maxLength={4}
    onChange={(ev) => updateEntry(i, `${section}ClientInitials`, ev.target.value.toUpperCase())} />
```

In the Shift 1 — In time input (around line 130), add the error class:

```jsx
<input type="time" className={`sdr-time-input ${fieldErrors[`${i}-${section}-timeIn`] ? 'sdr-field-error' : ''}`} value={e[`${section}TimeIn`] || ''} disabled={disabled}
    onChange={(ev) => updateEntry(i, `${section}TimeIn`, ev.target.value)} />
```

In the Shift 1 — Out time input (around line 139), add the error class:

```jsx
<input type="time" className={`sdr-time-input ${fieldErrors[`${i}-${section}-timeOut`] ? 'sdr-field-error' : ''}`} value={e[`${section}TimeOut`] || ''} disabled={disabled}
    onChange={(ev) => updateEntry(i, `${section}TimeOut`, ev.target.value)} />
```

- [ ] **Step 6: Pass `fieldErrors` prop to both SectionBlock calls**

In the JSX where `<SectionBlock>` is rendered (~lines 456–467 and 469–482), add `fieldErrors={fieldErrors}` to both:

```jsx
<SectionBlock
    header={pasHeader}
    activities={ADL_ACTIVITIES}
    section="adl"
    entries={entries}
    updateEntry={updateEntry}
    dailyHoursFn={adlHrs}
    disabled={submitted || !pasEnabled}
    sectionDisabled={!pasEnabled}
    onAddShift={handleAddShift}
    onRemoveShift={handleRemoveShift}
    fieldErrors={fieldErrors}
/>

<SectionBlock
    header={iadlHeader}
    activities={IADL_ACTIVITIES}
    section={iadlSection}
    entries={entries}
    updateEntry={updateEntry}
    dailyHoursFn={iadlHoursFn}
    disabled={submitted || !iadlAnyEnabled || (iadlTab === 'iadl' && !hmEnabled) || (iadlTab === 'respite' && !respiteEnabled)}
    sectionDisabled={!iadlAnyEnabled}
    onAddShift={handleAddShift}
    onRemoveShift={handleRemoveShift}
    respiteEnabled={respiteEnabled}
    isIadlSection
    fieldErrors={fieldErrors}
/>
```

- [ ] **Step 7: Add error highlighting to signature and name fields**

Update the PCA Name and Recipient Name form groups (~lines 496–498) to add error classes:

```jsx
<div className={`form-group ${fieldErrors.pcaFullName ? 'sdr-name-error' : ''}`}><label>PCA Name (First, MI, Last) <span className="sdr-required">*</span></label><input type="text" value={pcaFullName} onChange={(e) => setPcaFullName(e.target.value)} disabled={submitted} placeholder="Jane A. Doe" /></div>
<div className={`form-group ${fieldErrors.recipientName ? 'sdr-name-error' : ''}`}><label>Recipient Name (First, MI, Last) <span className="sdr-required">*</span></label><input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={submitted} placeholder="John B. Client" /></div>
```

Update the PCA Signature pad (~line 501) to add error class:

```jsx
<div className={`ts-signatures ${fieldErrors.pcaSig ? 'sdr-sig-error' : ''}`}>
    <SignaturePad label="PCA Signature *" value={pcaSig} onChange={setPcaSig} disabled={submitted} />
</div>
```

Update the Recipient Signature pad (~line 503):

```jsx
<div className={`ts-signatures ${fieldErrors.recipientSig ? 'sdr-sig-error' : ''}`} style={{ paddingBottom: 16 }}>
    <SignaturePad label="Recipient / Responsible Party Signature *" value={recipientSig} onChange={setRecipientSig} disabled={submitted} />
</div>
```

- [ ] **Step 8: Change Submit button to `btn--success`**

Replace the buttons section (~lines 508–518):

```jsx
{!submitted && (
    <div className="pca-form-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: 16 }}>
        <button className="btn btn--outline" onClick={handleSave} disabled={saving || submitting}>{saving ? 'Saving…' : 'Save Progress'}</button>
        <button className="btn btn--success" onClick={handleSubmit} disabled={submitting || saving}>{submitting ? 'Submitting…' : 'Submit Timesheet'}</button>
    </div>
)}
```

Note: The Submit button no longer disables on `validationError` — instead it shows validation highlights when clicked. Remove the `title={validationError}` as well.

Also remove the old validation error text display (~lines 514–518):

```jsx
{/* DELETE this block — replaced by inline field highlighting */}
{!submitted && validationError && (
    <div style={{ textAlign: 'right', padding: '0 16px 16px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
        {validationError}
    </div>
)}
```

- [ ] **Step 9: Verify PCA form validation**

Open a PCA form link. Leave some fields empty on a partially filled day. Click "Submit Timesheet":
- Missing fields should highlight with red border + subtle red background
- Page should scroll to the first error
- Toast should show the error message
- Submit button should be green
- Save Progress button should have blue border

Fill in the missing fields — red highlights should clear (because `fieldErrors` recomputes).

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/PcaFormPage.jsx client/src/index.css
git commit -m "feat: add PCA form validation highlighting and success button"
```

---

### Task 10: Update CSS Comment for PCA form toast

**Files:**
- Modify: `client/src/pages/PcaFormPage.jsx:520` (inline toast)

The PCA form has its own inline toast with hardcoded dark colors. Update it to use CSS variables for consistency.

- [ ] **Step 1: Update the inline toast style**

Replace the toast div (~line 520):

```jsx
{toast && <div className="pca-form-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', borderRadius: 8, zIndex: 1000, fontSize: 13, fontWeight: 500 }}>{toast}</div>}
```

This already uses CSS variables — no functional change, just ensures consistency.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/PcaFormPage.jsx
git commit -m "style: ensure PCA form toast uses CSS variables"
```

---

### Task 11: Build and Final Verification

**Files:** None (build step only)

- [ ] **Step 1: Build the client**

```bash
cd client && npm run build
```

- [ ] **Step 2: Start the production server and verify all pages**

```bash
cd server && npm run dev
```

Open `http://localhost:4000` and verify each page:

| Page | Checks |
|------|--------|
| Login | "PCAlink" title, blue header bar, blue Sign In button |
| Sidebar | "PCAlink" header, blue active state, blue hover |
| Dashboard | Blue stat card accents, blue buttons |
| Clients | Blue "Add Client" button, subtle blue table headers |
| Timesheets | Blue action buttons, blue table headers |
| Scheduling | Blue "Create Shift", blue week nav |
| Payroll | Blue tabs, blue upload button |
| PCA Form | Green Submit, blue outline Save, red validation on submit attempt |
| Schedule View | "PCAlink" footer text, blue nav buttons |
| Employees/Users/Settings | Blue primary buttons |

- [ ] **Step 3: Commit build output**

```bash
git add client/dist
git commit -m "build: rebuild client with PCAlink visual refresh"
```
