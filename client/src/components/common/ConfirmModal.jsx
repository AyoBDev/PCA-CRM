import Modal from './Modal';
import Icons from './Icons';

export default function ConfirmModal({ title, message, onConfirm, onClose, confirmLabel, confirmVariant }) {
    return (
        <Modal onClose={onClose}>
            <h2 className="modal__title">{title}</h2>
            <p className="modal__desc">{message}</p>
            <div className="form-actions">
                <button className="btn btn--outline" onClick={onClose}>Cancel</button>
                <button className={`btn btn--${confirmVariant || 'danger'}`} onClick={onConfirm}>
                    {!confirmVariant || confirmVariant === 'danger' ? Icons.trash : null} {confirmLabel || 'Delete'}
                </button>
            </div>
        </Modal>
    );
}
