export default function LoadingState({ rows = 4 }) {
    return (
        <div className="loading-state">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="skeleton skeleton-row" />
            ))}
        </div>
    );
}
