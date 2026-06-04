import { useState } from 'react';
import Modal from './Modal';
import Icons from './Icons';

export default function DeleteConfirmModal({
    title,
    items,
    onConfirm,
    onClose,
    confirmLabel = 'Delete',
    scopeWarning = null,
}) {
    const count = items.length;
    const needsTyped = count >= 5;
    const [typedConfirm, setTypedConfirm] = useState('');
    const [scopeAcknowledged, setScopeAcknowledged] = useState(!scopeWarning);
    const expectedText = `DELETE ${count}`;
    const canConfirm = needsTyped
        ? typedConfirm === expectedText && scopeAcknowledged
        : scopeAcknowledged;

    return (
        <Modal onClose={onClose} wide={count > 4}>
            <h2 className="modal__title">{title || `Delete ${count} item${count !== 1 ? 's' : ''}?`}</h2>
            <p className="modal__desc">
                This action will archive {count} item{count !== 1 ? 's' : ''}. You can restore them from the Trash drawer.
            </p>

            {scopeWarning && (
                <div className="dcm-scope-warning">
                    <span className="dcm-scope-warning__icon">{Icons.alertTriangle}</span>
                    <span className="dcm-scope-warning__text">{scopeWarning}</span>
                    <label className="dcm-scope-warning__ack">
                        <input
                            type="checkbox"
                            checked={scopeAcknowledged}
                            onChange={(e) => setScopeAcknowledged(e.target.checked)}
                        />
                        I understand
                    </label>
                </div>
            )}

            {count <= 10 && (
                <div className="dcm-item-list">
                    {items.map((item, i) => (
                        <div key={i} className="dcm-item-list__row">{item.label}</div>
                    ))}
                </div>
            )}
            {count > 10 && (
                <div className="dcm-item-list">
                    {items.slice(0, 8).map((item, i) => (
                        <div key={i} className="dcm-item-list__row">{item.label}</div>
                    ))}
                    <div className="dcm-item-list__row dcm-item-list__row--more">
                        ...and {count - 8} more
                    </div>
                </div>
            )}

            {needsTyped && (
                <div className="form-group" style={{ marginTop: 16 }}>
                    <label>Type <strong>{expectedText}</strong> to confirm:</label>
                    <input
                        type="text"
                        value={typedConfirm}
                        onChange={(e) => setTypedConfirm(e.target.value)}
                        placeholder={expectedText}
                        autoFocus
                    />
                </div>
            )}

            <div className="form-actions">
                <button className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button
                    className="btn btn--danger"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                >
                    {Icons.trash} {confirmLabel}
                </button>
            </div>
        </Modal>
    );
}
