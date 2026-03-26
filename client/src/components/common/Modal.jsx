export default function Modal({ children, onClose, wide }) {
    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={`modal${wide ? ' modal--wide' : ''}`}>{children}</div>
        </div>
    );
}
