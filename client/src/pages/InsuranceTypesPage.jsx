import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icons from '../components/common/Icons';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../hooks/useToast';

function InsuranceTypeFormModal({ insuranceType, onSave, onClose }) {
    const [name, setName] = useState(insuranceType?.name || '');
    const [color, setColor] = useState(insuranceType?.color || '#9E9E9E');
    const isEdit = !!insuranceType;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim().toUpperCase(), color });
    };

    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{isEdit ? 'Edit Insurance Type' : 'Add Insurance Type'}</h2>
            <p className="modal__desc">{isEdit ? 'Update the insurance type details.' : 'Create a new insurance type.'}</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="itName">Name</label>
                    <input id="itName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MEDICAID" autoFocus required />
                </div>
                <div className="form-group">
                    <label htmlFor="itColor">Color</label>
                    <div className="color-picker-row">
                        <input
                            id="itColor"
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
                <div className="form-actions">
                    <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn--primary">{isEdit ? 'Save Changes' : 'Add Type'}</button>
                </div>
            </form>
        </Modal>
    );
}

export default function InsuranceTypesPage() {
    const { showToast } = useToast();
    const [insuranceTypes, setInsuranceTypes] = useState([]);
    const [modal, setModal] = useState(null);

    const fetchInsuranceTypes = useCallback(async () => {
        try { setInsuranceTypes(await api.getInsuranceTypes()); }
        catch (err) { showToast(err.message, 'error'); }
    }, [showToast]);

    useEffect(() => { fetchInsuranceTypes(); }, [fetchInsuranceTypes]);

    const handleSave = async (data) => {
        try {
            if (modal.insuranceType) {
                await api.updateInsuranceType(modal.insuranceType.id, data);
                showToast('Insurance type updated');
            } else {
                await api.createInsuranceType(data);
                showToast('Insurance type created');
            }
            setModal(null);
            fetchInsuranceTypes();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleDelete = async (type) => {
        try {
            await api.deleteInsuranceType(type.id);
            showToast('Insurance type deleted');
            setModal(null);
            fetchInsuranceTypes();
        } catch (err) { showToast(err.message, 'error'); }
    };

    return (
        <>
            <div className="content-header">
                <h1 className="content-header__title">Insurance Types</h1>
                <div className="content-header__actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'form' })}>
                        {Icons.plus} Add Type
                    </button>
                </div>
            </div>
            <div className="page-content">
                <div className="it-grid">
                    {insuranceTypes.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">{Icons.shieldCheck}</div>
                            <div className="empty-state__title">No insurance types yet</div>
                            <div className="empty-state__desc">Click "Add Type" to create one.</div>
                        </div>
                    ) : (
                        insuranceTypes.map((t) => (
                            <div key={t.id} className="it-card">
                                <div className="it-card__color" style={{ background: t.color }} />
                                <div className="it-card__info">
                                    <div className="it-card__name">{t.name}</div>
                                    <div className="it-card__hex">{t.color}</div>
                                </div>
                                <div className="it-card__actions">
                                    <button className="btn btn--ghost btn--icon" onClick={() => setModal({ type: 'form', insuranceType: t })} title="Edit">
                                        {Icons.edit}
                                    </button>
                                    <button className="btn btn--danger-ghost btn--icon" onClick={() => setModal({ type: 'confirmDelete', insuranceType: t })} title="Delete">
                                        {Icons.trash}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {modal?.type === 'form' && (
                <InsuranceTypeFormModal insuranceType={modal.insuranceType} onSave={handleSave} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'confirmDelete' && (
                <ConfirmModal
                    title="Delete Insurance Type"
                    message={`This will permanently delete "${modal.insuranceType.name}". This action cannot be undone.`}
                    onConfirm={() => handleDelete(modal.insuranceType)}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}
