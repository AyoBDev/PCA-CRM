# Fillable PDF Form Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect and render fillable PDF form fields (text, checkbox, radio, dropdown) as editable HTML inputs in the existing PDF editor, with save-as-filled-version.

**Architecture:** On PDF load, pdf-lib extracts AcroForm fields and their page positions. Each field renders as a positioned HTML input over the PDF canvas. On save, pdf-lib fills field values into the document and uploads as a new version.

**Tech Stack:** pdf-lib (already installed, has AcroForm API), React 19, existing PdfEditorPage infrastructure.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `client/src/utils/pdfFormFields.js` | Extract form fields from pdf-lib PDFDocument, coordinate transforms |
| `client/src/components/pdf/PdfFormField.jsx` | Renders a single form field as positioned HTML input/select/checkbox |
| `client/src/components/pdf/PdfPageCanvas.jsx` | Modify — pass form fields for current page, render PdfFormField elements |
| `client/src/utils/pdfSave.js` | Modify — add fillFormFields() that writes values back before save |
| `client/src/pages/PdfEditorPage.jsx` | Modify — extract fields on load, manage formValues state, wire into save |
| `client/src/index.css` | Add form field input styles |

---

## Task 1: Form Field Extraction Utility

**Files:**
- Create: `client/src/utils/pdfFormFields.js`

- [ ] **Step 1: Create pdfFormFields.js**

```javascript
import { PDFDocument, PDFName, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from 'pdf-lib';

export async function extractFormFields(pdfBytes) {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const result = [];

    for (const field of fields) {
        const name = field.getName();
        const widgets = field.acroField.getWidgets();

        for (const widget of widgets) {
            const rect = widget.getRectangle();
            const pageRef = widget.P();
            const pageIndex = pageRef ? pdfDoc.getPages().findIndex(p => p.ref === pageRef) : 0;

            const fieldInfo = {
                name,
                page: pageIndex >= 0 ? pageIndex : 0,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                readOnly: field.isReadOnly(),
            };

            if (field instanceof PDFTextField) {
                fieldInfo.type = 'text';
                fieldInfo.value = field.getText() || '';
                fieldInfo.multiline = field.isMultiline();
            } else if (field instanceof PDFCheckBox) {
                fieldInfo.type = 'checkbox';
                fieldInfo.value = field.isChecked();
            } else if (field instanceof PDFRadioGroup) {
                fieldInfo.type = 'radio';
                fieldInfo.value = field.getSelected() || '';
                fieldInfo.options = field.getOptions();
            } else if (field instanceof PDFDropdown) {
                fieldInfo.type = 'dropdown';
                fieldInfo.value = field.getSelected()?.[0] || '';
                fieldInfo.options = field.getOptions();
            } else {
                continue;
            }

            result.push(fieldInfo);
        }
    }

    return result;
}

export function pdfRectToScreen(rect, pageHeight, zoom) {
    return {
        left: rect.x * zoom,
        top: (pageHeight - rect.y - rect.height) * zoom,
        width: rect.width * zoom,
        height: Math.max(rect.height * zoom, 20),
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/utils/pdfFormFields.js
git commit -m "feat: add form field extraction utility for fillable PDFs"
```

---

## Task 2: PdfFormField Component

**Files:**
- Create: `client/src/components/pdf/PdfFormField.jsx`

- [ ] **Step 1: Create PdfFormField.jsx**

```javascript
import { pdfRectToScreen } from '../../utils/pdfFormFields';

export default function PdfFormField({ field, pageHeight, zoom, value, onChange }) {
    const pos = pdfRectToScreen(field.rect, pageHeight, zoom);

    const style = {
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        zIndex: 20,
    };

    if (field.readOnly) {
        style.opacity = 0.6;
        style.pointerEvents = 'none';
    }

    if (field.type === 'text') {
        const InputTag = field.multiline ? 'textarea' : 'input';
        return (
            <InputTag
                className="pdf-form-field pdf-form-field--text"
                style={style}
                value={value || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                placeholder={field.name}
                disabled={field.readOnly}
            />
        );
    }

    if (field.type === 'checkbox') {
        return (
            <div className="pdf-form-field pdf-form-field--checkbox" style={style}>
                <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => onChange(field.name, e.target.checked)}
                    disabled={field.readOnly}
                />
            </div>
        );
    }

    if (field.type === 'radio') {
        return (
            <div className="pdf-form-field pdf-form-field--radio" style={style}>
                {(field.options || []).map(opt => (
                    <label key={opt} className="pdf-form-field__radio-label">
                        <input
                            type="radio"
                            name={field.name}
                            value={opt}
                            checked={value === opt}
                            onChange={() => onChange(field.name, opt)}
                            disabled={field.readOnly}
                        />
                        <span>{opt}</span>
                    </label>
                ))}
            </div>
        );
    }

    if (field.type === 'dropdown') {
        return (
            <select
                className="pdf-form-field pdf-form-field--dropdown"
                style={style}
                value={value || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                disabled={field.readOnly}
            >
                <option value="">— Select —</option>
                {(field.options || []).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        );
    }

    return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/pdf/PdfFormField.jsx
git commit -m "feat: add PdfFormField component for rendering form inputs"
```

---

## Task 3: Add fillFormFields to pdfSave.js

**Files:**
- Modify: `client/src/utils/pdfSave.js`

- [ ] **Step 1: Add fillFormFields function**

Add this function at the end of `client/src/utils/pdfSave.js`, after the existing `flattenAnnotations` function:

```javascript
export async function fillFormFields(pdfBytes, formValues) {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    for (const [name, value] of Object.entries(formValues)) {
        try {
            const field = form.getFieldMaybe(name);
            if (!field) continue;

            if (field instanceof PDFTextField) {
                field.setText(value || '');
            } else if (field instanceof PDFCheckBox) {
                if (value) field.check();
                else field.uncheck();
            } else if (field instanceof PDFRadioGroup) {
                if (value) field.select(value);
            } else if (field instanceof PDFDropdown) {
                if (value) field.select(value);
            }
        } catch (e) {
            console.warn(`Failed to fill field "${name}":`, e);
        }
    }

    form.flatten();
    return pdfDoc.save();
}
```

Also add the missing pdf-lib imports at the top of the file. The current import is:
```javascript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
```

Change it to:
```javascript
import { PDFDocument, StandardFonts, rgb, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from 'pdf-lib';
```

- [ ] **Step 2: Commit**

```bash
git add client/src/utils/pdfSave.js
git commit -m "feat: add fillFormFields function to write form values into PDF"
```

---

## Task 4: Integrate Form Fields into PdfPageCanvas

**Files:**
- Modify: `client/src/components/pdf/PdfPageCanvas.jsx`

- [ ] **Step 1: Add form field rendering**

Read `client/src/components/pdf/PdfPageCanvas.jsx`. The component receives props and renders a canvas + SVG overlay + optional text input. We need to add form field rendering.

Add a new prop `formFields` and `formValues` and `onFormFieldChange` to the component. Then render PdfFormField elements for fields on this page.

Add the import at the top:
```javascript
import PdfFormField from './PdfFormField';
```

Add these props to the destructured props:
```javascript
    formFields,
    formValues,
    onFormFieldChange,
    pageHeight,
```

Before the closing `</div>` of the component's return (just before `{editingAnn && (`), add:

```javascript
            {formFields && formFields
                .filter(f => f.page === pageIndex)
                .map(field => (
                    <PdfFormField
                        key={field.name + '-' + field.page}
                        field={field}
                        pageHeight={pageHeight}
                        zoom={zoom}
                        value={formValues[field.name]}
                        onChange={onFormFieldChange}
                    />
                ))
            }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/pdf/PdfPageCanvas.jsx
git commit -m "feat: render form fields in PdfPageCanvas"
```

---

## Task 5: Integrate Form Fields into PdfEditorPage

**Files:**
- Modify: `client/src/pages/PdfEditorPage.jsx`

- [ ] **Step 1: Add imports**

Add at the top of the file, after the existing imports:
```javascript
import { extractFormFields } from '../utils/pdfFormFields';
import { fillFormFields } from '../utils/pdfSave';
```

- [ ] **Step 2: Add form state**

After the existing state declarations (after `const [confirmClose, setConfirmClose] = useState(false);`), add:

```javascript
    const [formFields, setFormFields] = useState([]);
    const [formValues, setFormValues] = useState({});
```

- [ ] **Step 3: Extract form fields on PDF load**

In the `loadPdf` function inside the `useEffect`, after `setPages(loadedPages);` (around line 70), add:

```javascript
                try {
                    const fields = await extractFormFields(bytes.slice());
                    setFormFields(fields);
                    const initialValues = {};
                    fields.forEach(f => { initialValues[f.name] = f.value; });
                    setFormValues(initialValues);
                } catch (e) {
                    console.warn('No form fields found:', e);
                }
```

- [ ] **Step 4: Add form field change handler**

After the `handleMoveStart` callback, add:

```javascript
    const handleFormFieldChange = useCallback((name, value) => {
        setFormValues(prev => ({ ...prev, [name]: value }));
    }, []);
```

- [ ] **Step 5: Update hasChanges to include form edits**

Replace:
```javascript
    const hasChanges = annotations.length > 0;
```

With:
```javascript
    const hasFormChanges = formFields.length > 0 && formFields.some(f => formValues[f.name] !== f.value);
    const hasChanges = annotations.length > 0 || hasFormChanges;
```

- [ ] **Step 6: Update handleSave to fill form fields**

Replace the existing `handleSave` callback with:

```javascript
    const handleSave = useCallback(async () => {
        if (!pdfBytes || (!annotations.length && !hasFormChanges)) return;
        setSaving(true);
        try {
            let modified = pdfBytes;
            if (annotations.length > 0) {
                modified = await flattenAnnotations(modified, annotations, zoom);
            }
            if (hasFormChanges) {
                modified = await fillFormFields(modified, formValues);
            }
            const blob = new Blob([modified], { type: 'application/pdf' });
            await api.replaceAdminFile(fileId, blob);
            const newBytes = new Uint8Array(modified);
            setPdfBytes(newBytes);

            const doc = await pdfjsLib.getDocument({ data: newBytes }).promise;
            setPdfDoc(doc);
            const loadedPages = [];
            for (let i = 1; i <= doc.numPages; i++) {
                loadedPages.push(await doc.getPage(i));
            }
            setPages(loadedPages);

            setAnnotations([]);
            setUndoStack([]);
            setRedoStack([]);
            setFormFields([]);
            setFormValues({});
            showToast('PDF saved successfully', 'success');
        } catch (err) {
            showToast('Failed to save: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [pdfBytes, annotations, zoom, fileId, showToast, hasFormChanges, formValues]);
```

- [ ] **Step 7: Update handleSaveAs to fill form fields**

Replace the existing `handleSaveAs` callback with:

```javascript
    const handleSaveAs = useCallback(async () => {
        if (!pdfBytes || (!annotations.length && !hasFormChanges)) return;
        setSaving(true);
        try {
            let modified = pdfBytes;
            if (annotations.length > 0) {
                modified = await flattenAnnotations(modified, annotations, zoom);
            }
            if (hasFormChanges) {
                modified = await fillFormFields(modified, formValues);
            }
            const base = fileName.replace(/\.pdf$/i, '');
            const versionMatch = base.match(/_v(\d+)$/);
            let newName;
            if (versionMatch) {
                newName = base.replace(/_v\d+$/, `_v${Number(versionMatch[1]) + 1}`) + '.pdf';
            } else {
                newName = base + '_filled.pdf';
            }
            const blob = new File([modified], newName, { type: 'application/pdf' });

            if (!folderId) throw new Error('Cannot determine target folder');
            await api.uploadAdminFile(folderId, blob);

            setAnnotations([]);
            setUndoStack([]);
            setRedoStack([]);
            setFormFields([]);
            setFormValues({});
            showToast(`Saved as ${newName}`, 'success');
        } catch (err) {
            showToast('Failed to save version: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [pdfBytes, annotations, zoom, fileName, folderId, showToast, hasFormChanges, formValues]);
```

- [ ] **Step 8: Pass form props to PdfPageCanvas**

In the JSX where PdfPageCanvas is rendered, add these props:

```javascript
                            formFields={formFields}
                            formValues={formValues}
                            onFormFieldChange={handleFormFieldChange}
                            pageHeight={page.getViewport({ scale: 1 }).height}
```

The full PdfPageCanvas element should look like:
```javascript
                        <PdfPageCanvas
                            pdfPage={page}
                            pageIndex={idx}
                            zoom={zoom}
                            activeTool={activeTool}
                            toolOptions={toolOptions}
                            annotations={annotations}
                            selectedId={selectedId}
                            onAnnotationAdd={handleAnnotationAdd}
                            onAnnotationUpdate={handleAnnotationUpdate}
                            onAnnotationSelect={setSelectedId}
                            onAnnotationDelete={handleAnnotationDelete}
                            onMoveStart={handleMoveStart}
                            formFields={formFields}
                            formValues={formValues}
                            onFormFieldChange={handleFormFieldChange}
                            pageHeight={page.getViewport({ scale: 1 }).height}
                        />
```

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/PdfEditorPage.jsx
git commit -m "feat: integrate form field extraction, editing, and save into PdfEditorPage"
```

---

## Task 6: CSS Styles for Form Fields

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add form field styles**

Add after the existing `.pdf-text-input` styles (search for `pdf-text-input` in the CSS file):

```css
/* ===== PDF Form Fields ===== */
.pdf-form-field {
    box-sizing: border-box;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 12px;
}

.pdf-form-field--text {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid hsl(var(--border));
    padding: 2px 4px;
    border-radius: 2px;
    resize: none;
    overflow: hidden;
}

.pdf-form-field--text:focus {
    border-color: hsl(var(--primary));
    outline: none;
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15);
}

.pdf-form-field--checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
}

.pdf-form-field--checkbox input {
    width: 16px;
    height: 16px;
    accent-color: hsl(var(--primary));
}

.pdf-form-field--radio {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 255, 255, 0.95);
    padding: 2px 4px;
    border-radius: 2px;
    overflow-y: auto;
}

.pdf-form-field__radio-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    cursor: pointer;
}

.pdf-form-field__radio-label input { accent-color: hsl(var(--primary)); }

.pdf-form-field--dropdown {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid hsl(var(--border));
    padding: 2px 4px;
    border-radius: 2px;
    font-size: 11px;
}

.pdf-form-field--dropdown:focus {
    border-color: hsl(var(--primary));
    outline: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "style: add CSS for PDF form field inputs (text, checkbox, radio, dropdown)"
```

---

## Task 7: Build and Verify

**Files:** None (verification)

- [ ] **Step 1: Build the client**

```bash
cd client && npm run build
```

Expected: `✓ built` with no errors.

- [ ] **Step 2: Check pdf-lib imports**

Verify that `PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown` are actually exported by pdf-lib:

```bash
cd client && node -e "const pdfLib = require('pdf-lib'); console.log('TextField:', !!pdfLib.PDFTextField); console.log('CheckBox:', !!pdfLib.PDFCheckBox); console.log('RadioGroup:', !!pdfLib.PDFRadioGroup); console.log('Dropdown:', !!pdfLib.PDFDropdown);"
```

If any are `false`, check the pdf-lib docs for the correct export names and fix imports.

- [ ] **Step 3: Test with a fillable PDF**

1. Find or create a fillable PDF (search for "fillable PDF sample" or create one with LibreOffice/Acrobat)
2. Upload it to the Files section
3. Click "Edit PDF" on it
4. Verify form fields appear as editable inputs overlaid on the PDF
5. Fill in values, click Save → verify new version is created with filled values
6. Open the saved version → verify fields are flattened (non-editable, values baked in)

- [ ] **Step 4: Test with a non-fillable PDF**

1. Open any regular PDF (no form fields)
2. Verify no form inputs appear
3. Verify annotation tools still work as before

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during fillable PDF testing"
```
