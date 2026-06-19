# Fillable PDF Form Support in PDF Editor

**Date:** 2026-06-19
**Status:** Design approved

## Problem

The existing PDF editor supports adding annotations (text, drawing, highlights) but cannot detect or fill existing form fields in fillable PDFs. Agency staff need to fill government/insurance forms and internal agency forms directly in the app without downloading them.

## Solution

Enhance the existing PdfEditorPage to auto-detect AcroForm fields in PDFs and render them as editable HTML inputs overlaid on the correct page at the correct coordinates. Form fields coexist with the existing annotation tools — no mode switch needed.

## Supported Field Types

| PDF Field Type | Rendered As | Behavior |
|---|---|---|
| Text field | `<input type="text">` or `<textarea>` | Type to fill, supports multi-line |
| Checkbox | `<input type="checkbox">` | Click to toggle |
| Radio button | `<input type="radio">` | Grouped by field name, click to select |
| Dropdown/combo | `<select>` | Shows options defined in the PDF field |

## Architecture

```
PdfEditorPage loads PDF
    ├── pdf-lib: PDFDocument.getForm() → extract field definitions
    │     └── For each field: name, type, position (rect), page, options, current value
    ├── Render: HTML inputs positioned absolutely over each page
    │     └── Coordinates mapped from PDF space (bottom-left) to screen space (top-left)
    └── Save: pdf-lib fills field values → pdfDoc.save() → upload as new version
```

### Detection Phase (on PDF load)

After loading the PDF with `pdf-lib`, call `pdfDoc.getForm()` to get the form object. Iterate all fields using `form.getFields()`. For each field, extract:

- `field.getName()` — unique identifier
- Field type (TextField, CheckBox, RadioGroup, Dropdown)
- Widget annotations → position rectangle (`/Rect`) and page reference
- Current value (pre-filled data if any)
- Options list (for dropdowns/radio)

### Rendering Phase

For each detected field, render a positioned HTML element over the PDF canvas:

```
<div style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px;">
    <input/select/checkbox ... />
</div>
```

Coordinates require transformation:
- PDF rect is `[x1, y1, x2, y2]` in PDF units (bottom-left origin)
- Convert to screen pixels: multiply by zoom scale, flip Y axis (same as annotation coordinate transform)

### Save Phase

When user saves:
1. Iterate form field values from state
2. For each field, call the appropriate pdf-lib setter:
   - `form.getTextField(name).setText(value)`
   - `form.getCheckBox(name).check()` / `.uncheck()`
   - `form.getRadioGroup(name).select(value)`
   - `form.getDropdown(name).select(value)`
3. Optionally flatten the form (makes fields non-editable in the output): `form.flatten()`
4. Save as new version (`_filled.pdf`)

## Integration with Existing Editor

- Form fields render ABOVE the SVG annotation layer (higher z-index)
- Form inputs have white background + border to distinguish from annotations
- Existing annotation tools (Text, Draw, Highlight, Eraser, Select) work unchanged
- `hasChanges` flag includes both annotations AND form field modifications
- Undo/redo does NOT apply to form field edits (form fields are stateless inputs — their values persist until save)

## Component Changes

| File | Change |
|------|--------|
| `client/src/utils/pdfFormFields.js` | New — extract form fields from pdf-lib document, coordinate transforms |
| `client/src/components/pdf/PdfFormField.jsx` | New — renders a single form field as positioned HTML input |
| `client/src/components/pdf/PdfPageCanvas.jsx` | Modify — render form fields for the current page |
| `client/src/pages/PdfEditorPage.jsx` | Modify — extract fields on load, track field values, fill on save |
| `client/src/utils/pdfSave.js` | Modify — add `fillFormFields()` function that writes values back |

## No New Dependencies

`pdf-lib` (already installed) has full AcroForm support:
- `PDFDocument.getForm()` → `PDFForm`
- `PDFForm.getFields()` → array of field objects
- `PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown` classes
- Widget annotation access for position/page data

## Field Value State

```javascript
// In PdfEditorPage state:
const [formFields, setFormFields] = useState([]);
// Each: { name, type, page, rect: {x,y,w,h}, value, options }

const [formValues, setFormValues] = useState({});
// Keyed by field name: { "Patient Name": "John Doe", "DOB": "01/01/1990", ... }
```

## Visual Style

Form field inputs:
- White background, 1px solid border (`hsl(var(--border))`)
- Font: 12px Helvetica (matches PDF rendering)
- Padding: 2px 4px
- Border-radius: 2px
- On focus: primary color border
- Checkboxes/radios: native browser styling, scaled to match field size

## Edge Cases

| Scenario | Handling |
|----------|----------|
| PDF has no form fields | No form inputs rendered, editor works as before (annotations only) |
| Field overlaps page boundary | Clip to page bounds |
| Read-only fields | Render as disabled inputs (grayed out) |
| Pre-filled values | Load existing values into state, display in inputs |
| Very small fields | Minimum rendered size of 20px height for usability |
| Flatten on save | Always flatten — produces a clean, non-editable filled PDF |
| Field with no position data | Skip rendering (some fields are hidden/calculated) |

## Save Behavior

Save always creates a new version:
- Original: `form.pdf`
- Filled: `form_filled.pdf` (or `form_filled_v2.pdf` if already exists)

The original template PDF is never overwritten — users can fill the same form multiple times.
