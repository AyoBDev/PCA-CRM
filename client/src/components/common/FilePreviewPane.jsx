import Icons from './Icons';
import DocViewer from './DocViewer';
import CertFileRow from '../files/CertFileRow';
import { useIsWide } from '../../hooks/useIsWide';

export default function FilePreviewPane({ items, selectedId, onSelect, open, onExpand, onDownload, emptyText = 'No files' }) {
    const wide = useIsWide(900);
    const docked = open && wide;
    const selected = items.find(i => i.id === selectedId) || null;

    // Clicking a file (row body OR the Preview/eye button) docks it in the
    // inline viewer. Full-screen is a deliberate, separate action: the Expand
    // control in the docked viewer's toolbar. When the pane isn't docked
    // (preview off, or too narrow for the split), previewing falls back to the
    // full-screen modal since there's no inline panel to show it in.
    const previewInline = (item) => { if (docked) onSelect(item.id); else onExpand(item); };

    return (
        <div className={`file-preview-pane${docked ? ' file-preview-pane--split' : ''}`}>
            <div className="file-preview-pane__list cert-history__list">
                {items.length === 0 ? (
                    <div className="file-preview-pane__empty">{emptyText}</div>
                ) : items.map(item => (
                    <CertFileRow
                        key={item.id}
                        upload={item}
                        fetchBlob={item.fetchBlob}
                        cacheKey={item.cacheKey}
                        badge={item.badge}
                        expiresText={item.meta}
                        selected={docked && item.id === selectedId}
                        onSelect={() => previewInline(item)}
                        onPreview={() => previewInline(item)}
                        onDownload={() => (onDownload ? onDownload(item) : previewInline(item))}
                    />
                ))}
            </div>
            {docked && (
                <div className="file-preview-pane__panel">
                    {selected ? (
                        <DocViewer
                            fileName={selected.fileName}
                            fetchBlob={selected.fetchBlob}
                            extraToolbarActions={(
                                <button className="doc-viewer__tool" onClick={() => onExpand(selected)} title="Expand" aria-label="Expand">{Icons.externalLink || Icons.eye}</button>
                            )}
                        />
                    ) : (
                        <div className="file-preview-pane__panel-empty">Select a file to preview</div>
                    )}
                </div>
            )}
        </div>
    );
}
