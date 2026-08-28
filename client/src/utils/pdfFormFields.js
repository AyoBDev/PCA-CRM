import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from 'pdf-lib';

export async function extractFormFields(pdfBytes) {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const result = [];

    for (const field of fields) {
        const name = field.getName();
        const widgets = field.acroField.getWidgets();
        const exportValues = field instanceof PDFRadioGroup
            ? field.acroField.getExportValues?.()
            : undefined;

        for (const [widgetIndex, widget] of widgets.entries()) {
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
                let optionValue = '';
                try {
                    // Export values (/Opt), when present, are index-aligned with the
                    // widgets/on-values and hold the friendly option name (e.g. "Yes").
                    // Without /Opt, the widget's own on-value IS the friendly name.
                    const exportName = exportValues?.[widgetIndex];
                    if (exportName) {
                        optionValue = exportName.decodeText();
                    } else {
                        const on = widget.getOnValue();
                        optionValue = on ? (on.decodeText ? on.decodeText() : on.asString?.() || String(on)) : '';
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
