import { Link } from 'react-router-dom';

export default function SummaryChip({ label, value, href, variant = 'neutral', icon }) {
  const cls = `stat-pill ${href ? 'stat-pill--link' : ''} stat-pill--${variant}`.trim();
  const body = (
    <>
      {icon && <span style={{ marginRight: 6, display: 'inline-flex' }}>{icon}</span>}
      {value !== '' && value != null && <strong style={{ marginRight: 6 }}>{value}</strong>}
      <span>{label}</span>
    </>
  );
  return href ? <Link to={href} className={cls}>{body}</Link> : <span className={cls}>{body}</span>;
}
