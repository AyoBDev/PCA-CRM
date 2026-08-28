import { pdfRectToScreen } from '../../utils/pdfFormFields';

export default function PdfFormField({ field, pageHeight, zoom, value, onChange }) {
    const pos = pdfRectToScreen(field.rect, pageHeight, zoom);
    const fontSize = Math.max(8, Math.min(pos.height * 0.7, 13 * (zoom || 1)));

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
        const InputTag = field.multiline ? 'textarea' : 'input';
        const narrow = pos.width < 60;
        return (
            <InputTag
                className="pdf-form-field pdf-form-field--text"
                style={{ ...style, padding: narrow ? '0 2px' : '2px 6px', textAlign: narrow ? 'center' : 'left' }}
                value={value || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
                placeholder={field.multiline ? '' : ''}
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
