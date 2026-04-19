import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';

function ServiceFormModal({ service, onSave, onClose }) {
    const [category, setCategory] = useState(service?.category || '');
    const [code, setCode] = useState(service?.code || '');
    const [name, setName] = useState(service?.name || '');
    const isEdit = !!service;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (code.trim()) onSave({ category: category.trim().toUpperCase(), code: code.trim().toUpperCase(), name: name.trim() });
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Service' : 'Add Service'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the service details.' : 'Create a new service entry.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="svcCategory">Category</label>
                    <input id="svcCategory" type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. PCS" />
                </div>
                <div className="form-group">
                    <label htmlFor="svcCode">Code</label>
                    <input id="svcCode" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. S5130" autoFocus required />
                </div>
                <div className="form-group">
                    <label htmlFor="svcName">Name</label>
                    <input id="svcName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Homemaker" />
                </div>
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Service'}</button>
                </div>
            </form>
        </Modal>
    );
}

export default function ServicesPage() {
    const { showToast, showUndoToast } = useToast();
    const [services, setServices] = useState([]);
    const [modal, setModal] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    const fetchServices = useCallback(async () => {
        try { setServices(await api.getServices({ archived: showArchived })); }
        catch (err) { showToast(err.message, 'error'); }
    }, [showToast, showArchived]);

    useEffect(() => { fetchServices(); }, [fetchServices]);

    const handleSave = async (data) => {
        try {
            if (modal.service) {
                await api.updateService(modal.service.id, data);
                showToast('Service updated');
            } else {
                await api.createService(data);
                showToast('Service created');
            }
            setModal(null);
            fetchServices();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (svc) => {
        try {
            await api.deleteService(svc.id);
            setModal(null);
            fetchServices();
            showUndoToast(`"${svc.code}" archived`, async () => {
                await api.restoreService(svc.id);
                fetchServices();
            });
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestore = async (svc) => {
        try {
            await api.restoreService(svc.id);
            showToast(`"${svc.code}" restored`);
            fetchServices();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Group by category
    const grouped = services.reduce((acc, s) => {
        (acc[s.category] = acc[s.category] || []).push(s);
        return acc;
    }, {});

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Services</h1>
                <div className="content-header__actions">
                    {!showArchived && (
                        <button className="archive-toggle" onClick={() => setShowArchived(true)}>
                            {Icons.archive} View Archived
                        </button>
                    )}
                    {!showArchived && (
                        <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'form' })}>
                            {Icons.plus} Add Service
                        </button>
                    )}
                </div>
            </div>
            <div className="page-content">
                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived services. Click "Restore" to bring items back.</span>
                        <button className="btn btn--outline btn--sm" onClick={() => setShowArchived(false)}>
                            {Icons.chevronLeft} Back to Active
                        </button>
                    </div>
                )}
                {services.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">{Icons.fileText}</div>
                        <div className="empty-state__title">No services yet</div>
                        <div className="empty-state__desc">Click "Add Service" to create one.</div>
                    </div>
                ) : (
                    Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat} className="svc-group">
                            <div className="svc-group__label">{cat}</div>
                            <div className="it-grid">
                                {items.map((s) => (
                                    <div key={s.id} className="it-card">
                                        <div className="svc-code-badge">{s.code}</div>
                                        <div className="it-card__info">
                                            <div className="it-card__name">{s.name || s.code}</div>
                                            <div className="it-card__hex">{s.category} · {s.code}</div>
                                        </div>
                                        <div className="it-card__actions">
                                            {showArchived ? (
                                                <button className="btn btn--restore" onClick={() => handleRestore(s)} title="Restore">
                                                    {Icons.rotateCcw} Restore
                                                </button>
                                            ) : (
                                                <>
                                                    <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', service: s })} title="Edit">
                                                        {Icons.edit}
                                                    </button>
                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDelete', service: s })} title="Delete">
                                                        {Icons.trash}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {modal?.type === 'form' && (
                <ServiceFormModal service={modal.service} onSave={handleSave} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Service"
                    message={`This will permanently delete "${modal.service.code}${modal.service.name ? ' — ' + modal.service.name : ''}". This action cannot be undone.`}
                    onConfirm={() => handleDelete(modal.service)}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}
