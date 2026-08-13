import Icons from './Icons';
import DocViewer from './DocViewer';

export default function CertViewerPanel({
    fileName, fetchBlob, status, statusClass = 'draft', onHistory, onReplace,
    emptyText = 'Select a certification to preview its document.',
}) {
    return (
        <div className="cert-viewer">
            <div className="cert-viewer__head">
                <div>
                    <h3 className="cert-viewer__title">Interactive Attachment Viewer</h3>
                    <p className="cert-viewer__subtitle">Clear in-app document preview. Downloading is optional.</p>
                </div>
            </div>
            {fetchBlob ? (
                <>
                    <div className="cert-viewer__filebar">
                        <span className="cert-viewer__filename">{Icons.fileText} {fileName}</span>
                        {status && <span className={`ts-badge ts-badge--${statusClass}`}>{status}</span>}
                    </div>
                    <div className="cert-viewer__body">
                        <DocViewer
                            fileName={fileName}
                            fetchBlob={fetchBlob}
                            extraToolbarActions={(
                                <>
                                    {onHistory && <button className="doc-viewer__tool" onClick={onHistory} title="History" aria-label="History">{Icons.history}</button>}
                                    {onReplace && <button className="doc-viewer__tool" onClick={onReplace} title="Replace / Upload" aria-label="Replace / Upload">{Icons.upload}</button>}
                                </>
                            )}
                        />
                    </div>
                </>
            ) : (
                <div className="cert-viewer__empty">{emptyText}</div>
            )}
        </div>
    );
}
