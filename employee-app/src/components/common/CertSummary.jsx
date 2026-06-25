const TILES = [
  { key: 'approved', label: 'Approved', mod: 'approved' },
  { key: 'pending', label: 'Pending', mod: 'pending' },
  { key: 'actionNeeded', label: 'Action Needed', mod: 'action' },
  { key: 'total', label: 'Total', mod: 'total' },
];

export default function CertSummary(props) {
  return (
    <div className="cert-summary">
      {TILES.map(t => (
        <div key={t.key} className={`cert-summary__tile cert-summary__tile--${t.mod}`}>
          <div className="cert-summary__count">{props[t.key] ?? 0}</div>
          <div className="cert-summary__label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
