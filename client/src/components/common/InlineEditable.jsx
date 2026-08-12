import { useState, useRef } from 'react';
import { useToast } from '../../hooks/useToast';
import Icons from './Icons';

// Shared safe inline-edit primitive.
// Read mode: value + hover pencil (only the pencil opens edit — a stray click on the text does nothing).
// Edit mode: input + ✓/✕. Enter/✓ = save, Escape/✕/blur = cancel (NO silent auto-save).
// Blank is blocked unless allowEmpty. On success: toast + optional undo entry.
export default function InlineEditable({
    value,
    displayValue,
    placeholder = '',
    type = 'text',
    multiline = false,
    min,
    max,
    allowEmpty = false,
    validate,
    onSave,
    undoState,
    buildUndo,
    undoLabel,
    width = 130,
    highlight = false,
    className = '',
    readOnly = false,
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? '');
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    // keep draft synced with parent value when not editing (e.g. server recalc)
    const prevValue = useRef(value);
    if (prevValue.current !== value) {
        prevValue.current = value;
        if (!editing) setDraft(value ?? '');
    }

    const runValidate = (v) => {
        if (validate) return validate(v);
        if (!allowEmpty && v.trim() === '') return 'Cannot be empty';
        if (type === 'number') {
            const n = Number(v);
            if (v.trim() === '' || isNaN(n)) return 'Enter a number';
            if (min != null && n < min) return `Min ${min}`;
            if (max != null && n > max) return `Max ${max}`;
        }
        return null;
    };

    const error = editing ? runValidate(draft) : null;

    const startEdit = () => { setDraft(value ?? ''); setEditing(true); };
    const cancel = () => { setDraft(value ?? ''); setEditing(false); };

    const commit = async () => {
        if (saving) return;
        const next = draft.trim();
        if (runValidate(next) != null) return;                 // invalid → do nothing
        if (next === (value ?? '').trim()) { setEditing(false); return; }  // unchanged
        setSaving(true);
        try {
            const result = await onSave(next);
            showToast(
                undoLabel ? `Updated ${undoLabel}` : 'Saved',
                'success'
            );
            if (undoState && buildUndo) {
                const u = buildUndo((value ?? '').trim(), next, result);
                undoState.pushAction(u.description, u.undo, u.redo);
            }
            setEditing(false);
        } catch (e) {
            showToast(e?.message || 'Save failed', 'error');
            setDraft(value ?? '');   // revert draft; stay in edit mode so user can retry/cancel
        } finally {
            setSaving(false);
        }
    };

    if (readOnly) {
        const isEmpty = value == null || value === '';
        return (
            <span className={`inline-editable__read ${className}`} style={{ opacity: 0.85 }}>
                {isEmpty ? placeholder : (displayValue ?? value)}
            </span>
        );
    }

    if (editing) {
        const InputTag = multiline ? 'textarea' : 'input';
        return (
            <span className="inline-editable inline-editable--editing">
                <InputTag
                    className="inline-editable__input"
                    type={multiline ? undefined : type}
                    value={draft}
                    min={type === 'number' ? min : undefined}
                    max={type === 'number' ? max : undefined}
                    rows={multiline ? 3 : undefined}
                    placeholder={placeholder}
                    autoFocus
                    style={{ width }}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={cancel}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); commit(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
                    }}
                />
                <button
                    type="button"
                    className="inline-editable__btn inline-editable__btn--save"
                    title="Save"
                    disabled={saving || error != null}
                    // onMouseDown (not onClick) so it fires before the input's onBlur cancels
                    onMouseDown={(e) => { e.preventDefault(); commit(); }}
                >{Icons.check}</button>
                <button
                    type="button"
                    className="inline-editable__btn inline-editable__btn--cancel"
                    title="Cancel"
                    onMouseDown={(e) => { e.preventDefault(); cancel(); }}
                >{Icons.x}</button>
                {error && <span className="inline-editable__error">{error}</span>}
            </span>
        );
    }

    const isEmpty = value == null || value === '';
    return (
        <span
            className={`inline-editable inline-editable--read ${highlight ? 'inline-editable--highlight' : ''} ${className}`}
            style={{ opacity: saving ? 0.5 : 1 }}
        >
            <span
                className="inline-editable__value"
                style={{ fontStyle: isEmpty ? 'italic' : 'normal' }}
                title={isEmpty ? undefined : (displayValue ?? value)}
            >
                {isEmpty ? placeholder : (displayValue ?? value)}
            </span>
            <button
                type="button"
                className="inline-editable__pencil"
                title="Edit"
                onClick={startEdit}
            >{Icons.edit}</button>
        </span>
    );
}
