import Icons from '../../components/common/Icons';

const DOC_CATEGORIES = [
    { value: 'admission_packet', label: 'Client Admission Packets', color: '#3b82f6' },
    { value: 'auth_pca', label: 'PCA Service Authorization', color: '#22c55e' },
    { value: 'auth_waiver', label: 'Waiver Service Authorization', color: '#f59e0b' },
    { value: 'auth_iso', label: 'ISO Service Authorization', color: '#06b6d4' },
    { value: 'iso_admission', label: 'ISO Admission Packets', color: '#0891b2' },
    { value: 'transfer', label: 'Transfer Documents', color: '#8b5cf6' },
    { value: 'hipaa', label: 'HIPAA', color: '#dc2626' },
    { value: 'discharge', label: 'Client Discharge Documents', color: '#ef4444' },
    { value: 'supervisor_review', label: 'Supervisor Review Documents', color: '#64748b' },
    { value: 'other', label: 'Other', color: '#94a3b8' },
];

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function DocumentsTab({
    client,
    expandedFolders,
    toggleFolder,
    setDocCategory,
    setShowDocUploadModal,
    handleDownloadDoc,
    setConfirmDelete,
}) {
    const docsByCategory = (client.documents || []).reduce((acc, d) => {
        if (!acc[d.category]) acc[d.category] = [];
        acc[d.category].push(d);
        return acc;
    }, {});
    const totalDocs = (client.documents || []).length;

    return (
        <div className="cp-tab-panel">
            <div className="cp-card cp-card--elevated">
                <div className="cp-card__header">
                    <h3 className="cp-card__title">
                        {Icons.folder} Documents
                        {totalDocs > 0 && <span className="cp-card__count">{totalDocs}</span>}
                    </h3>
                    <button className="btn btn--primary btn--sm" onClick={() => { setDocCategory('admission_packet'); setShowDocUploadModal(true); }}>{Icons.upload} Upload</button>
                </div>
                <div className="cp-card__body cp-doc-folders">
                    {DOC_CATEGORIES.map(cat => {
                        const docs = docsByCategory[cat.value] || [];
                        const isExpanded = expandedFolders[cat.value] !== false && docs.length > 0;
                        return (
                            <div key={cat.value} className={`cp-doc-folder ${docs.length > 0 ? 'cp-doc-folder--has-files' : ''}`}>
                                <button
                                    className="cp-doc-folder__header"
                                    onClick={() => docs.length > 0 && toggleFolder(cat.value)}
                                    style={{ '--folder-color': cat.color }}
                                >
                                    <span className="cp-doc-folder__chevron" style={{ opacity: docs.length > 0 ? 1 : 0, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                        {Icons.chevronRight}
                                    </span>
                                    <span className="cp-doc-folder__icon">{Icons.folder}</span>
                                    <span className="cp-doc-folder__name">{cat.label}</span>
                                    {docs.length > 0 && <span className="cp-doc-folder__count">{docs.length}</span>}
                                    <button
                                        className="btn btn--ghost btn--icon cp-doc-folder__upload"
                                        title={`Upload to ${cat.label}`}
                                        onClick={(e) => { e.stopPropagation(); setDocCategory(cat.value); setShowDocUploadModal(true); }}
                                    >
                                        {Icons.upload}
                                    </button>
                                </button>
                                {isExpanded && docs.length > 0 && (
                                    <div className="cp-doc-folder__files">
                                        {docs.map(doc => (
                                            <div key={doc.id} className="cp-doc-file">
                                                <span className="cp-doc-file__icon">{Icons.paperclip}</span>
                                                <span className="cp-doc-file__name">{doc.fileName}</span>
                                                <span className="cp-doc-file__meta">{formatFileSize(doc.fileSize)}</span>
                                                <span className="cp-doc-file__meta">{formatDate(doc.createdAt)}</span>
                                                <div className="cp-doc-file__actions">
                                                    <button className="btn btn--ghost btn--icon" title="Download" onClick={() => handleDownloadDoc(doc)}>{Icons.download}</button>
                                                    <button className="btn btn--danger-ghost btn--icon" title="Delete" onClick={() => setConfirmDelete({ type: 'doc', item: doc })}>{Icons.trash}</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
