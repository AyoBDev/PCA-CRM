import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useUndoStack } from '../hooks/useUndoStack';
import { useServices } from '../hooks/useServices';
import { ACCOUNT_NUMBER_OPTIONS } from '../utils/accountMapping';
import GlobalToolbar from '../components/common/GlobalToolbar';
import ContextBar from '../components/common/ContextBar';

const TIMESHEET_SECTION_OPTIONS = ['', 'PAS', 'Homemaker', 'Respite', 'Companion'];

function ServiceFormModal({ service, onSave, onClose }) {
    const [category, setCategory] = useState(service?.category || '');
    const [code, setCode] = useState(service?.code || '');
    const [name, setName] = useState(service?.name || '');
    const [label, setLabel] = useState(service?.label || '');
    const [accountNumber, setAccountNumber] = useState(service?.accountNumber || '');
    const [color, setColor] = useState(service?.color || '#64748b');
    const [timesheetSection, setTimesheetSection] = useState(service?.timesheetSection || '');
    const [sortOrder, setSortOrder] = useState(service?.sortOrder != null ? service.sortOrder : 50);
    const [enforceAuthLimit, setEnforceAuthLimit] = useState(service?.enforceAuthLimit ?? true);
    const isEdit = !!service;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (code.trim()) {
            onSave({
                category: category.trim().toUpperCase(),
                code: code.trim().toUpperCase(),
                name: name.trim(),
                label: label.trim(),
                accountNumber,
                color,
                timesheetSection,
                sortOrder: sortOrder === '' ? 50 : Number(sortOrder),
                enforceAuthLimit,
            });
        }
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
                <div className="form-group">
                    <label htmlFor="svcLabel">Label</label>
                    <input id="svcLabel" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Homemaker (S5130)" />
                </div>
                <div className="form-group">
                    <label htmlFor="svcAccountNumber">Account #</label>
                    <select id="svcAccountNumber" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}>
                        <option value="">— None —</option>
                        {ACCOUNT_NUMBER_OPTIONS.map((acct) => (
                            <option key={acct} value={acct}>{acct}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="svcColor">Color</label>
                    <div className="color-picker-row">
                        <input
                            id="svcColor"
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="color-picker-input"
                        />
                        <input
                            type="text"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            placeholder="#000000"
                            style={{ flex: 1 }}
                        />
                        <span className="color-preview" style={{ background: color }} />
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="svcTimesheetSection">Timesheet Section</label>
                    <select id="svcTimesheetSection" value={timesheetSection} onChange={(e) => setTimesheetSection(e.target.value)}>
                        {TIMESHEET_SECTION_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt || '— None —'}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="svcSortOrder">Sort Order</label>
                    <input id="svcSortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="50" />
                </div>
                <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={enforceAuthLimit}
                            onChange={(e) => setEnforceAuthLimit(e.target.checked)}
                        />
                        Enforce auth limit
                    </label>
                    <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                        When off, this service's timesheet section has no authorized-units ceiling (e.g. private-pay).
                    </p>
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
    const { isAdmin } = useAuth();
    const { showToast, showUndoToast } = useToast();
    const undoState = useUndoStack();
    const { refetch: refetchServicesContext } = useServices();
    const [services, setServices] = useState([]);
    const [modal, setModal] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(null);
    const [confirmBulkPermanentDelete, setConfirmBulkPermanentDelete] = useState(false);

    const fetchServices = useCallback(async () => {
        try { setServices(await api.getServices({ archived: showArchived })); }
        catch (err) { showToast(err.message, 'error'); }
    }, [showToast, showArchived]);

    useEffect(() => { fetchServices(); }, [fetchServices]);

    const handleSave = async (data) => {
        try {
            if (modal.service) {
                const oldData = {
                    category: modal.service.category,
                    code: modal.service.code,
                    name: modal.service.name,
                    label: modal.service.label,
                    accountNumber: modal.service.accountNumber,
                    color: modal.service.color,
                    timesheetSection: modal.service.timesheetSection,
                    sortOrder: modal.service.sortOrder,
                    enforceAuthLimit: modal.service.enforceAuthLimit,
                };
                await api.updateService(modal.service.id, data);
                showToast('Service updated');
                const id = modal.service.id;
                undoState.pushAction(`Updated "${data.code}"`,
                    async () => { await api.updateService(id, oldData); fetchServices(); refetchServicesContext(); },
                    async () => { await api.updateService(id, data); fetchServices(); refetchServicesContext(); }
                );
            } else {
                const created = await api.createService(data);
                showToast('Service created');
                undoState.pushAction(`Created "${data.code}"`,
                    async () => { await api.deleteService(created.id); fetchServices(); refetchServicesContext(); },
                    async () => { await api.createService(data); fetchServices(); refetchServicesContext(); }
                );
            }
            setModal(null);
            fetchServices();
            refetchServicesContext();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (svc) => {
        try {
            await api.deleteService(svc.id);
            setModal(null);
            fetchServices();
            refetchServicesContext();
            undoState.pushAction(`Archived "${svc.code}"`,
                async () => { await api.restoreService(svc.id); fetchServices(); refetchServicesContext(); },
                async () => { await api.deleteService(svc.id); fetchServices(); refetchServicesContext(); }
            );
            showUndoToast(`"${svc.code}" archived`, async () => {
                await api.restoreService(svc.id);
                fetchServices();
                refetchServicesContext();
            });
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleRestore = async (svc) => {
        try {
            await api.restoreService(svc.id);
            showToast(`"${svc.code}" restored`);
            fetchServices();
            refetchServicesContext();
            undoState.pushAction(`Restored "${svc.code}"`,
                async () => { await api.deleteService(svc.id); fetchServices(); refetchServicesContext(); },
                async () => { await api.restoreService(svc.id); fetchServices(); refetchServicesContext(); }
            );
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handlePermanentDelete = async (svc) => {
        try {
            await api.permanentlyDeleteService(svc.id);
            setConfirmPermanentDelete(null);
            showToast('Item permanently deleted');
            fetchServices();
            refetchServicesContext();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleBulkPermanentDelete = async () => {
        try {
            const result = await api.bulkPermanentlyDeleteServices();
            setConfirmBulkPermanentDelete(false);
            showToast(`${result.count} archived service(s) permanently deleted`);
            fetchServices();
            refetchServicesContext();
        } catch (err) { showToast(err.message, 'error'); }
    };

    // Group by category
    const grouped = services.reduce((acc, s) => {
        (acc[s.category] = acc[s.category] || []).push(s);
        return acc;
    }, {});

    return (
        <>
            <GlobalToolbar
                title="Services"
                subtitle="Manage service types and codes"
                icon={Icons.shieldCheck}
                activityEntity="Service"
                undoState={undoState}
                archiveConfig={{
                    isArchiveView: showArchived,
                    onToggle: () => setShowArchived(!showArchived),
                }}
            />
            <ContextBar>
                <ContextBar.Right>
                    {!showArchived && (
                        <button className="btn btn--primary" onClick={() => setModal({ type: 'form' })}>
                            {Icons.plus} Add Service
                        </button>
                    )}
                </ContextBar.Right>
            </ContextBar>
            <div className="page-content">
                {showArchived && (
                    <div className="archived-banner">
                        {Icons.archive}
                        <span style={{ flex: 1 }}>Viewing archived services. Click "Restore" to bring items back.</span>
                        {services.length > 0 && (
                            <button className="btn btn--danger btn--sm" onClick={() => setConfirmBulkPermanentDelete(true)}>
                                {Icons.trash} Delete All Archived
                            </button>
                        )}
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
                                        <span className="it-card__color" style={{ background: s.color || 'hsl(var(--muted))', width: 14, height: 14, flexShrink: 0 }} title={s.color || ''} />
                                        <div className="svc-code-badge">{s.code}</div>
                                        <div className="it-card__info">
                                            <div className="it-card__name">{s.name || s.code}</div>
                                            <div className="it-card__hex">
                                                {s.category} · {s.code}
                                                {s.timesheetSection && (
                                                    <span className="badge badge--outline" style={{ marginLeft: 8 }}>{s.timesheetSection}</span>
                                                )}
                                                {s.enforceAuthLimit === false && (
                                                    <span className="badge badge--outline text-muted" style={{ marginLeft: 8 }}>no limit</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="it-card__actions">
                                            {showArchived ? (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn--restore" onClick={() => handleRestore(s)} title="Restore">
                                                        {Icons.rotateCcw} Restore
                                                    </button>
                                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setConfirmPermanentDelete(s)} title="Delete permanently">{Icons.trash}</button>
                                                </div>
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
            {confirmPermanentDelete && (
                <ConfirmModal
                    title="Permanently Delete Service"
                    message={`Permanently delete "${confirmPermanentDelete.code}${confirmPermanentDelete.name ? ' — ' + confirmPermanentDelete.name : ''}"? This action cannot be undone.`}
                    confirmLabel="Delete Forever"
                    confirmVariant="danger"
                    onConfirm={() => handlePermanentDelete(confirmPermanentDelete)}
                    onClose={() => setConfirmPermanentDelete(null)}
                />
            )}
            {confirmBulkPermanentDelete && (
                <ConfirmModal
                    title="Delete All Archived Services"
                    message={`Permanently delete all ${services.length} archived service(s)? This action cannot be undone.`}
                    confirmLabel="Delete All Forever"
                    confirmVariant="danger"
                    onConfirm={handleBulkPermanentDelete}
                    onClose={() => setConfirmBulkPermanentDelete(false)}
                />
            )}
        </>
    );
}
