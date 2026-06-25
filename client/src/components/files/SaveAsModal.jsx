import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Modal from '../common/Modal';
import Icons from '../common/Icons';
import * as api from '../../api';

export default function SaveAsModal({ open, defaultName, defaultFolderId, onSave, onClose }) {
    const [name, setName] = useState(defaultName || '');
    const [folderId, setFolderId] = useState(defaultFolderId ?? null);
    const [folders, setFolders] = useState([]);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const nameRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setName(defaultName || '');
        setFolderId(defaultFolderId ?? null);
        setError(null);
        setSearch('');
    }, [open, defaultName, defaultFolderId]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingFolders(true);
        (async () => {
            try {
                const flat = [];
                const walk = async (parentId) => {
                    const data = await api.listFolders(parentId);
                    for (const f of (data.folders || [])) {
                        flat.push(f);
                        await walk(f.id);
                    }
                };
                await walk(null);
                if (!cancelled) setFolders(flat);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Failed to load folders');
            } finally {
                if (!cancelled) setLoadingFolders(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    useEffect(() => {
        if (open && nameRef.current) {
            const inputEl = nameRef.current;
            inputEl.focus();
            const dotIndex = (inputEl.value || '').lastIndexOf('.');
            if (dotIndex > 0) inputEl.setSelectionRange(0, dotIndex);
            else inputEl.select();
        }
    }, [open]);

    const filteredFolders = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return folders;
        return folders.filter(f => (f.path || f.name || '').toLowerCase().includes(q));
    }, [folders, search]);

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
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search folders…"
                        className="save-as__search"
                    />
                    <div className="save-as__folder-list">
                        {loadingFolders ? (
                            <div className="save-as__folder-empty">Loading folders…</div>
                        ) : filteredFolders.length === 0 ? (
                            <div className="save-as__folder-empty">
                                {folders.length === 0 ? 'No folders available' : 'No folders match your search'}
                            </div>
                        ) : (
                            filteredFolders.map((f) => (
                                <button
                                    type="button"
                                    key={f.id}
                                    className={`save-as__folder-item ${folderId === f.id ? 'save-as__folder-item--active' : ''}`}
                                    onClick={() => setFolderId(f.id)}
                                >
                                    <span className="save-as__folder-icon">{Icons.folder}</span>
                                    <span className="save-as__folder-path">{f.path || f.name}</span>
                                    {folderId === f.id && <span className="save-as__folder-check">{Icons.check}</span>}
                                </button>
                            ))
                        )}
                    </div>
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
