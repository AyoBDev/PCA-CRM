import CertViewerPanel from './CertViewerPanel';
import CertFileRow from '../files/CertFileRow';
import { useIsWide } from '../../hooks/useIsWide';

// Shared docked file preview used on /files, the employee certifications tab,
// and the client authorizations tab — ONE component, so behavior changes here
// apply everywhere.
//
// Behavior:
// - Wide screens: clicking a file (row body, thumbnail, or the Preview/eye
//   button) shows it INLINE in the side viewer — never full-screen. The panel
//   appears as soon as a file is selected, even when the `open` toggle is off;
//   the toggle just controls whether the (empty) panel is shown by default.
//   Full-screen is a deliberate, separate action: the Expand button in the
//   viewer's toolbar.
// - Narrow screens: there's no room for a side panel, so clicking a file opens
//   the full-screen modal via `onExpand` (the only place full-screen is
//   automatic).
export default function FilePreviewPane({
    items, selectedId, onSelect, open, onExpand, onDownload,
    emptyText = 'No files',
}) {
    const wide = useIsWide(900);
    const selected = items.find(i => i.id === selectedId) || null;
    // On a wide screen the panel is shown when the toggle is on OR a file has
    // been picked — so a click reveals the viewer even with the toggle off.
    const showPanel = wide && (open || !!selected);

    const previewInline = (item) => {
        if (wide) onSelect(item.id);   // dock inline
        else onExpand(item);           // no room to dock → full-screen
    };

    return (
        <div className={`file-preview-pane${showPanel ? ' file-preview-pane--split' : ''}`}>
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
                        selected={showPanel && item.id === selectedId}
                        onSelect={() => previewInline(item)}
                        onPreview={() => previewInline(item)}
                        onDownload={() => (onDownload ? onDownload(item) : previewInline(item))}
                        leading={item.leading}
                        extraActions={item.extraActions}
                    />
                ))}
            </div>
            {showPanel && (
                <div className="file-preview-pane__panel">
                    <CertViewerPanel
                        fileName={selected?.fileName}
                        fetchBlob={selected?.fetchBlob}
                        onExpand={selected ? () => onExpand(selected) : undefined}
                    />
                </div>
            )}
        </div>
    );
}
