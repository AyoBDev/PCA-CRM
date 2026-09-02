import { pdfRectToScreen } from '../../utils/pdfFormFields';

export default function PdfFormField({ field, pageHeight, zoom, value, onChange }) {
    const pos = pdfRectToScreen(field.rect, pageHeight, zoom);
    // Render editing text at the same size the flattened PDF will actually
    // use. A field's /DA carries either an explicit point size or 0 (auto) —
    // auto-size fields (pdf-lib/Acrobat) scale the text to fill the box
    // height when flattened, roughly height * 0.8 for a single line.
    const renderFont = field.fontSize > 0
        ? field.fontSize * (zoom || 1)
        : pos.height * 0.8;

    const style = {
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        fontSize: renderFont,
        zIndex: 20,
    };

    if (field.readOnly) {
        style.opacity = 0.6;
        style.pointerEvents = 'none';
    }

    if (field.type === 'text') {
        const narrow = pos.width < 60;
        // Narrow boxes (e.g. date Month/Day/Year, ~18px) can't fit the full
        // auto/explicit size without clipping 2 digits — cap it, but keep a
        // floor so the digits stay legible.
        const effFont = narrow ? Math.min(renderFont, Math.max(6, pos.height * 0.6)) : renderFont;
        // Only use a textarea for fields that are both flagged multiline AND
        // tall enough to show more than one line. Small/short fields (e.g. the
        // Month/Day/Year date boxes, which are multiline in the PDF but tiny)
        // render as single-line inputs so their content isn't clipped/garbled.
        // Decide textarea vs single-line from the PDF-authored (unscaled) rect
        // size so the choice doesn't flip as the user zooms. Raw point units:
        // tall+wide multiline boxes (e.g. a comments field) get a textarea;
        // small multiline boxes (e.g. date Month/Day/Year) get a single-line input.
        const useTextarea = field.multiline && field.rect.height >= 24 && field.rect.width >= 60;
        const InputTag = useTextarea ? 'textarea' : 'input';
        const textStyle = narrow
            ? { ...style, fontSize: effFont, width: pos.width + 8, marginLeft: -4, padding: 0, textAlign: 'center', boxSizing: 'border-box', whiteSpace: 'nowrap' }
            : { ...style, fontSize: effFont, padding: '2px 6px', textAlign: 'left', whiteSpace: useTextarea ? 'normal' : 'nowrap' };
        return (
            <InputTag
                className="pdf-form-field pdf-form-field--text"
                style={textStyle}
                value={value || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
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
                    style={{ width: '100%', height: '100%', margin: 0 }}
                />
            </div>
        );
    }

    if (field.type === 'radio-option') {
        return (
            <div className="pdf-form-field pdf-form-field--checkbox" style={style}>
                <input
                    type="radio"
                    name={field.name}
                    checked={value === field.optionValue}
                    onChange={() => onChange(field.name, field.optionValue)}
                    disabled={field.readOnly}
                    style={{ width: '100%', height: '100%', margin: 0 }}
                />
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
