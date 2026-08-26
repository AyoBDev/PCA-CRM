import Icons from './Icons';
import DocViewer from './DocViewer';

// The single shared "Interactive Attachment Viewer" used on /files (inside
// FilePreviewPane), the employee certifications tab, and the client
// authorizations tab. ONE component — behavior/looks change here for all three.
//
// Renders the selected document inline via DocViewer (never full-screen).
// Full-screen is a deliberate, separate action: the Expand button (onExpand).
// Optional onHistory / onReplace add surface-specific toolbar actions.
export default function CertViewerPanel({
    fileName, fetchBlob, status, statusClass = 'draft',
    onExpand, onHistory, onReplace,
    emptyText = 'Select a file to preview it here.',
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
                                    {onExpand && <button className="doc-viewer__tool" onClick={onExpand} title="Open full screen" aria-label="Open full screen">{Icons.externalLink || Icons.eye}</button>}
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
