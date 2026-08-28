import { pdfRectToScreen } from '../../utils/pdfFormFields';

export default function PdfFormField({ field, pageHeight, zoom, value, onChange }) {
    const pos = pdfRectToScreen(field.rect, pageHeight, zoom);
    // Fit font to the smaller of height-based and a width-based bound so
    // content in very narrow boxes (date Month/Day/Year) isn't clipped.
    const heightFont = pos.height * 0.7;
    const widthFont = pos.width * 0.5; // ~2 chars fit comfortably
    const fontSize = Math.max(7, Math.min(heightFont, widthFont, 13 * (zoom || 1)));

    const style = {
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        fontSize,
        zIndex: 20,
    };

    if (field.readOnly) {
        style.opacity = 0.6;
        style.pointerEvents = 'none';
    }

    if (field.type === 'text') {
        const narrow = pos.width < 60;
        // Only use a textarea for fields that are both flagged multiline AND
        // tall enough to show more than one line. Small/short fields (e.g. the
        // Month/Day/Year date boxes, which are multiline in the PDF but tiny)
        // render as single-line inputs so their content isn't clipped/garbled.
        const useTextarea = field.multiline && pos.height >= 28 && pos.width >= 60;
        const InputTag = useTextarea ? 'textarea' : 'input';
        return (
            <InputTag
                className="pdf-form-field pdf-form-field--text"
                style={{ ...style, padding: narrow ? '0 1px' : '2px 6px', textAlign: narrow ? 'center' : 'left', whiteSpace: useTextarea ? 'normal' : 'nowrap' }}
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
