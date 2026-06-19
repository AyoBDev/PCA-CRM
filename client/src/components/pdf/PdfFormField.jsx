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
