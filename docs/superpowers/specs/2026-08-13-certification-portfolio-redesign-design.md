# Certification Portfolio Redesign — Two-Column Persistent Viewer

**Date:** 2026-08-13
**Status:** Draft (design)
**Area:** Employee certifications (`EmployeeDetailPage.jsx` → `CertificationsTab`), reusable preview components

## Summary

Redesign the employee **Certifications tab** into a two-column "certification portfolio" matching the approved mockup: a **cards grid on the left** (one card per certification with icon, status badge, expiry + days-remaining, a status-colored progress bar, renewal cadence, and per-card **View / Upload / Replace** actions) and a **persistent "Interactive Attachment Viewer" on the right** that renders the selected certification's document inline (via the existing `DocViewer`), with its own header (file name + status) and toolbar.

This replaces the current "expand a card → toggle a docked pane" flow with a **single always-present split**: selecting any card immediately shows its document on the right. The same pattern is applied to the **client detail** Programs/Authorizations attachments (per the user's "employee and client details page" request), reusing the shared components.

The sliding on/off **ToggleSwitch** (already built) governs whether the right viewer panel is shown on narrower widths; on wide screens the two-column portfolio is the default.

## Mockup Anatomy (verified against the image)

- **Tab header:** section title "Certifications" + subtitle "Select a certification to view its attachment in the interactive panel on the right." Filter chips **All / Active / Expiring / Missing** (note: mockup adds **Missing**; current tab has All/Active/Expiring/Expired). An "Edit Dates" affordance stays.
- **Left — cards grid (2 columns):** each card:
  - colored **left border** + icon tile (status/type color)
  - cert **name** + **status badge** (Active / Expiring / Not Set / Complete)
  - **expiry line** ("Expires Feb 24, 2033") + **days-remaining** ("2,388 days remaining"), or "No expiration date entered" / "Completed Jan 10, 2026"
  - a **progress bar** colored by status (green active, amber expiring, purple not-set, etc.), width ~ proportion of the renewal window remaining
  - a **Renewal** row (right-aligned value: "1 year", "2 years", "Per ID date", "Not required")
  - actions: **View** + **Upload** (or **Replace** when a file already exists)
  - the **selected** card is highlighted (blue ring), driving the right panel
- **Right — Interactive Attachment Viewer (persistent):**
  - panel title "Interactive Attachment Viewer" + subtitle "Clear in-app document preview. Downloading is optional."
  - toolbar: **Zoom − / Zoom + / Fit Width / History / Replace/Upload** (maps to `DocViewer`'s controls + a History and a Replace/Upload action)
  - selected **file name** + **status badge**
  - the rendered **document** (DocViewer canvas), with a footer note and page indicator
  - empty state when no card is selected

## Current State (verified)

- `CertificationsTab` (in `EmployeeDetailPage.jsx`) already renders: a 2-column `pa-services-grid` of `pa-service-card`s via `renderCertCard(ct)`; `CERT_TYPES` catalog (id_expiration, tb_test, cpr, annual_training, cultural_competency, infection_control, background_check, other) each with `renewalYears`; filter chips All/Active/Expiring/Expired (`certFilter` values `All/OK/Critical/Expired`); status via `statusLabel`/`statusBadgeClass`; per-cert records with `status` (active/pending/expired), `fileName`, `expirationDate`, `uploads[]`.
- The recently-added docked preview lives **inside an expanded card** (`split`, `selectedFileId`, a `FilePreviewPane`, a `certFetchBlobs` memoized Map). This spec **moves the preview out of the card and into a persistent right column**.
- `DocViewer` (`common/DocViewer.jsx`) renders a file from a `fetchBlob: () => Promise<Response>`, with zoom/fit/rotate/page/download/print and `extraToolbarActions`.
- `ToggleSwitch` (`common/ToggleSwitch.jsx`) — sliding on/off switch (just added).
- Download endpoints: `api.downloadEmployeeCertification(id)` (active file), `api.downloadCertificationUpload(id)` (history). Upload via the existing cert upload modal (`onEdit` / `setShowCertModal`).
- No progress bar currently; renewal is shown as "{n}yr". No "Missing" filter.

## Design

### Layout — `cert-portfolio` (two columns)

Replace the current `cp-card` body (grid + expandable pane) with:

```
.cert-portfolio               (flex row on wide; stacks on narrow)
  .cert-portfolio__list       (left; the cards grid + filter chips)
  .cert-portfolio__viewer     (right; the persistent Interactive Attachment Viewer)
```

- **Wide (≥ ~1024px):** both columns visible; the viewer is sticky/persistent. Selecting a card sets `selectedCertId` and the viewer renders that cert's active file.
- **Narrow:** the viewer column collapses; a card's **View** opens the full-screen `PreviewModal` instead (reuse the existing modal + `useIsWide`). The **ToggleSwitch** ("Viewer") lets the user force the panel on/off where width allows.

### Component A — `CertCard` (extract + enrich)

Extract the current inline `renderCertCard` into a `CertCard` component (keep it local to the file or a new `pages/employee/CertCard.jsx`) with the mockup's structure:

- Props: `{ cert, records, selected, onSelect, onView, onUpload, statusMeta }`.
- Renders icon tile, name, status badge, expiry/days-remaining (or completed / no-date), a **progress bar** (new `.cert-card__progress` with a width % and status color), the Renewal row, and View + Upload/Replace buttons.
- **Progress %:** for a dated cert, `remaining / renewalWindow` clamped 0–100 (renewalWindow from `renewalYears`, or the full span to `expirationDate` when `renewalYears` is null). Not-set → indeterminate/short bar. Completed one-time → full bar.
- Clicking the card body (or **View**) calls `onSelect(cert)` (wide) or `onView(cert)` → modal (narrow). Selected card gets the ring highlight.

### Component B — `CertViewerPanel` (persistent right column)

New presentational panel wrapping `DocViewer`:

- Props: `{ file, fetchBlob, status, onReplace, onHistory }` (or a normalized `selectedItem`).
- Header: title + subtitle; the selected file name + status badge.
- Body: `<DocViewer fileName fetchBlob extraToolbarActions={<History/> + <Replace/Upload/>} />`. History opens the cert's upload history (reuse the existing history list / `PreviewModal` per-upload), Replace/Upload triggers the existing upload modal for that cert.
- Empty state: "Select a certification to preview its document." when nothing selected or the selected cert has no file.

> Note: `DocViewer` already provides Zoom/Fit/rotate/download/print. The mockup's "Zoom − / Zoom + / Fit Width" are DocViewer's toolbar; "History" and "Replace/Upload" are the panel's `extraToolbarActions`. Keep one toolbar (DocViewer's) and inject the two extra actions — do not build a parallel toolbar.

### Filters

Add a **Missing** filter (certs with no file / no expiration where one is required) alongside All / Active / Expiring. Keep Expired (mockup shows All/Active/Expiring/Missing; retain Expired too, or fold per implementation — decide in the plan, default: All / Active / Expiring / Missing / Expired). Selecting a filter narrows the left grid only; the viewer keeps its current selection if still visible, else clears.

### Selection state

`CertificationsTab` owns `selectedCertId` (the cert whose file is in the viewer). On first load, auto-select the first cert that has a file (so the viewer isn't empty). Selecting a card updates it. Uses stable memoized `fetchBlob`s (reuse the `certFetchBlobs` Map pattern already in place) so `DocViewer` doesn't refetch on unrelated re-renders.

### Client detail parity

Apply the same persistent two-column treatment to the client **Programs/Authorizations** attachments (`ProgramsAuthTab`): the shared auth-doc pane becomes a persistent viewer beside the auth cards when the ToggleSwitch is on (it already has the switch + one shared `FilePreviewPane`). Minimal change — mostly CSS/layout to match the portfolio look; the data wiring exists.

## Reuse & consistency

- Reuse `DocViewer` (single render engine), `ToggleSwitch`, `PreviewModal` (narrow-screen + Expand), `CertFileRow`/history, and the `certFetchBlobs` memo pattern.
- New pieces: `CertCard` (extracted/enriched), `CertViewerPanel`, `.cert-portfolio*` + `.cert-card__progress` CSS, a `progressForCert()` helper, a "Missing" filter predicate.
- Update `CLAUDE.md`'s File Preview section to note the persistent two-column portfolio pattern and `CertViewerPanel`.

## Testing

- **`progressForCert()`** (vitest, pure): dated active cert → correct %; expired → 0; not-set → indeterminate; completed one-time → full.
- **`CertCard`** (vitest): renders name/status/expiry/renewal; shows Replace when a file exists, Upload when not; `onSelect` fires on card/View click; `selected` adds the ring class.
- **`CertViewerPanel`** (vitest, mock `DocViewer`): renders the selected file name + status; empty state with no selection; History/Replace actions fire.
- Existing `DocViewer`/`FilePreviewPane`/`PreviewModal` tests stay green.
- Manual: employee certs portfolio (select cards → viewer updates, progress bars correct, Upload/Replace, History, narrow-screen modal fallback); client auth parity.

## Out of Scope

- No changes to the cert data model, upload/renewal backend, or audit.
- No new document types beyond current certifications.
- The "Portfolio History" and "Expires in N days" header chips from the mockup are nice-to-have polish — include only if cheap; not required for the core redesign.

## Files Touched (anticipated)

- `client/src/pages/EmployeeDetailPage.jsx` (`CertificationsTab` → portfolio layout; extract `CertCard`; `selectedCertId`; wire `CertViewerPanel`)
- `client/src/components/common/CertViewerPanel.jsx` (new) — or co-located under `pages/employee/`
- `client/src/components/.../CertCard.jsx` (new, extracted)
- `client/src/utils/` — `progressForCert()` helper (+ a "Missing" predicate)
- `client/src/pages/client-tabs/ProgramsAuthTab.jsx` (persistent-viewer layout parity)
- `client/src/index.css` (`.cert-portfolio*`, `.cert-card__progress`, viewer panel)
- `CLAUDE.md` (document the portfolio pattern + `CertViewerPanel`)
- Tests: `progressForCert`, `CertCard`, `CertViewerPanel`.
```
