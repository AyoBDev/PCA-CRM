import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import { useToast } from '../hooks/useToast';

export default function PermanentLinksPage() {
    const { showToast } = useToast();
    const [links, setLinks] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newClientId, setNewClientId] = useState('');
    const [newPcaName, setNewPcaName] = useState('');

    const load = useCallback(async () => {
        try {
            const [linksRes, clientsRes] = await Promise.all([
                api.getPermanentLinks(),
                api.getClients(),
            ]);
            setLinks(linksRes);
            setClients(clientsRes);
        } catch (err) {
            showToast(err.message, 'error');
        }
        setLoading(false);
    }, [showToast]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        if (!newClientId || !newPcaName.trim()) {
            showToast('Select a client and enter PCA name', 'error');
            return;
        }
        try {
            await api.createPermanentLink({ clientId: Number(newClientId), pcaName: newPcaName.trim() });
            showToast('Link created');
            setShowModal(false);
            setNewClientId('');
            setNewPcaName('');
            load();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDeactivate = async (id) => {
        try {
            await api.deletePermanentLink(id);
            showToast('Link deactivated');
            load();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const buildUrl = (token) => `${window.location.origin}/pca-form/${token}`;

    const copyLink = (token) => {
        navigator.clipboard.writeText(buildUrl(token));
        showToast('Link copied!');
    };

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Permanent Links</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setShowModal(true)}>{Icons.plus} Create Link</button>
                </div>
            </div>
            <div className="page-content">
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
                ) : links.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__title">No permanent links yet</div>
                        <div className="empty-state__desc">Create a reusable link for each PCA+Client pair. Each link always opens the current week's timesheet.</div>
                    </div>
                ) : (
                    <div className="sheet-card">
                        <table className="data-table">
                            <thead>
                                <tr><th>PCA Name</th><th>Client</th><th>Link</th><th>Status</th><th>Created</th><th style={{ width: 160 }}>Actions</th></tr>
                            </thead>
                            <tbody>
                                {links.map((link) => (
                                    <tr key={link.id}>
                                        <td style={{ fontWeight: 500 }}>{link.pcaName}</td>
                                        <td>{link.client?.clientName || '—'}</td>
                                        <td style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 320 }}>{buildUrl(link.token)}</td>
                                        <td>
                                            <span className={`ts-badge ts-badge--${link.active ? 'submitted' : 'draft'}`}>
                                                {link.active ? 'active' : 'inactive'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 13 }}>{new Date(link.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn--outline btn--sm" onClick={() => copyLink(link.token)}>{Icons.copy} Copy</button>
                                                {link.active && (
                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => handleDeactivate(link.id)} title="Deactivate">{Icons.trash}</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {showModal && (
                <Modal onClose={() => setShowModal(false)}>
                    <h2 className="modal__title">Create Permanent Link</h2>
                    <p className="modal__desc">One link per PCA+Client pair. The PCA will use this link every week.</p>
                    <div className="form-group">
                        <label>Client</label>
                        <select value={newClientId} onChange={(e) => setNewClientId(e.target.value)}>
                            <option value="">Select a client…</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>PCA Name</label>
                        <input type="text" value={newPcaName} onChange={(e) => setNewPcaName(e.target.value)} placeholder="Jane Smith" />
                    </div>
                    <div className="form-actions">
                        <button className="btn btn--outline" onClick={() => setShowModal(false)}>Cancel</button>
                        <button className="btn btn--primary" onClick={handleCreate}>Create Link</button>
                    </div>
                </Modal>
            )}
        </>
    );
}
