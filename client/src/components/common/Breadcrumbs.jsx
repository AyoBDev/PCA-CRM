import { useNavigate } from 'react-router-dom';
import Icons from './Icons';

export default function Breadcrumbs({ items }) {
    const navigate = useNavigate();
    return (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
            {items.map((item, i) => (
                <span key={i} className="breadcrumbs__item">
                    {i > 0 && <span className="breadcrumbs__separator">{Icons.chevronRight}</span>}
                    {item.path ? (
                        <button className="breadcrumbs__link" onClick={() => navigate(item.path)}>
                            {item.label}
                        </button>
                    ) : (
                        <span className="breadcrumbs__current" aria-current="page">{item.label}</span>
                    )}
                </span>
            ))}
        </nav>
    );
}
