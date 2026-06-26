import { useState, useEffect, useRef, useCallback } from 'react';
import Modal from '../common/Modal';
import FolderTreePicker from './FolderTreePicker';

export default function SaveAsModal({ open, defaultName, defaultFolderId, onSave, onClose }) {
    const [name, setName] = useState(defaultName || '');
    const [folderId, setFolderId] = useState(defaultFolderId ?? null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const nameRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setName(defaultName || '');
        setFolderId(defaultFolderId ?? null);
        setError(null);
    }, [open, defaultName, defaultFolderId]);

    useEffect(() => {
        if (open && nameRef.current) {
            const inputEl = nameRef.current;
            inputEl.focus();
            const dotIndex = (inputEl.value || '').lastIndexOf('.');
            if (dotIndex > 0) inputEl.setSelectionRange(0, dotIndex);
            else inputEl.select();
        }
    }, [open]);

    const handleConfirm = useCallback(async (e) => {
        e?.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setError('File name is required');
            return;
        }
        if (folderId == null) {
            setError('Choose a destination folder');
            return;
        }
        setError(null);
        setSaving(true);
        try {
            await onSave({ name: trimmed, folderId });
        } catch (err) {
            setError(err.message || 'Failed to save');
            setSaving(false);
            return;
        }
        setSaving(false);
    }, [name, folderId, onSave]);

    if (!open) return null;

    return (
        <Modal onClose={onClose} wide>
            <h2 className="modal__title">Save as new file</h2>
            <p className="modal__desc">Choose a name and destination folder for the new version. The original file is unchanged.</p>

            <form onSubmit={handleConfirm}>
                <div className="form-group">
                    <label htmlFor="save-as-name">File name</label>
                    <input
                        ref={nameRef}
                        id="save-as-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="document_v2.pdf"
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Destination folder</label>
                    <FolderTreePicker
                        selectedFolderId={folderId}
                        onSelect={(f) => setFolderId(f.id)}
                    />
                </div>

                {error && <div className="save-as__error">{error}</div>}

                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn--primary" disabled={saving || !name.trim() || folderId == null}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
