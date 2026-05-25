import Icons from './Icons';

export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
    return (
        <div className="page-error">
            <div className="page-error__icon">{Icons.alertTriangle}</div>
            <div className="page-error__title">Failed to load</div>
            <div className="page-error__desc">{message}</div>
            {onRetry && <button className="btn btn--outline" onClick={onRetry}>Retry</button>}
        </div>
    );
}
