import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from 'pdf-lib';

// Matches the point size out of a PDF /DA (default appearance) string, e.g.
// "/Helv 0 Tf 0 g" -> "0", "/Helv 10.5 Tf" -> "10.5". A size of 0 (or a DA
// with no parseable Tf size) means AUTO-SIZE: pdf-lib/Acrobat scale the text
// to fill the field's box height when the form is flattened.
const DA_FONT_SIZE_RE = /\/[^\s]+\s+([\d.]+)\s+Tf/;

function parseDaFontSize(da) {
    if (!da) return 0;
    const match = DA_FONT_SIZE_RE.exec(da);
    if (!match) return 0;
    const size = parseFloat(match[1]);
    return Number.isFinite(size) && size > 0 ? size : 0;
}

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
                // Per-field /DA wins; fall back to the AcroForm root /DA (some
                // PDFs only set a default there); no DA at all (or an
                // unparseable/zero size) means auto-size -> fontSize: 0.
                const fieldDa = field.acroField.getDefaultAppearance();
                const rootDa = fieldDa ? undefined : form.acroForm.getDefaultAppearance?.();
                fieldInfo.fontSize = parseDaFontSize(fieldDa || rootDa);
            } else if (field instanceof PDFCheckBox) {
                fieldInfo.type = 'checkbox';
                fieldInfo.value = field.isChecked();
            } else if (field instanceof PDFRadioGroup) {
                let optionValue = '';
                try {
                    // pdf-lib's getExportValues() is index-aligned with getOnValues(),
                    // NOT with the raw widget list — getOnValues() filters out any
                    // widget whose getOnValue() is falsy, so a raw widget index can be
                    // off-by-one vs exportValues. Mirror exactly what pdf-lib's own
                    // PDFRadioGroup.getSelected() does: find this widget's on-value
                    // inside getOnValues(), then read the aligned exportValues entry
                    // at that same index.
                    const on = widget.getOnValue(); // PDFName | undefined, per-widget
                    if (on) {
                        const onValues = field.acroField.getOnValues?.() || [];
                        const exportValues = field.acroField.getExportValues?.();
                        // Compare by decoded string — PDFName identity isn't
                        // guaranteed to hold across separate API calls.
                        let idx = -1;
                        for (let i = 0; i < onValues.length; i++) {
                            if (onValues[i].decodeText() === on.decodeText()) { idx = i; break; }
                        }
                        if (exportValues && idx >= 0 && exportValues[idx]) {
                            optionValue = exportValues[idx].decodeText();
                        } else {
                            optionValue = on.decodeText();
                        }
                    }
                } catch { optionValue = ''; }
                if (!optionValue) continue; // widget with no selectable on-value
                fieldInfo.type = 'radio-option';
                fieldInfo.optionValue = optionValue;
                fieldInfo.value = field.getSelected() || '';
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
    const h = rect.height * zoom;
    return {
        left: rect.x * zoom,
        top: (pageHeight - rect.y - rect.height) * zoom,
        width: rect.width * zoom,
        height: h < 14 ? 14 : h,
    };
}
