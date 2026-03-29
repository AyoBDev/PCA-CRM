import Icons from './Icons';

export default function Pagination({ page, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;
    return (
        <div className="pagination">
            <button
                className="btn btn--outline btn--sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
            >
                {Icons.chevronLeft} Prev
            </button>
            <span className="pagination__info">
                Page {page} of {totalPages}
            </span>
            <button
                className="btn btn--outline btn--sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
            >
                Next {Icons.chevronRight}
            </button>
        </div>
    );
}
