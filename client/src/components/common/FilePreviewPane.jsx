import Icons from './Icons';
import DocViewer from './DocViewer';
import CertFileRow from '../files/CertFileRow';
import { useIsWide } from '../../hooks/useIsWide';

export default function FilePreviewPane({ items, selectedId, onSelect, open, onExpand, onDownload, emptyText = 'No files' }) {
    const wide = useIsWide(900);
    const docked = open && wide;
    const selected = items.find(i => i.id === selectedId) || null;

    const rowSelect = (item) => { if (docked) onSelect(item.id); else onExpand(item); };

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
                        onSelect={() => rowSelect(item)}
                        onPreview={() => onExpand(item)}
                        onDownload={() => (onDownload ? onDownload(item) : onExpand(item))}
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
