// client/src/components/common/FileThumbnailStrip.jsx
import { useState } from 'react';
import Modal from './Modal';
import FileThumbnail from './FileThumbnail';

export default function FileThumbnailStrip({ files, makeCacheKey, makeFetchBlob, onPreview, max = 1 }) {
    const [galleryOpen, setGalleryOpen] = useState(false);
    if (!files || files.length === 0) return null;

    const shown = files.slice(0, max);
    const extra = files.length - shown.length;

    const thumb = (file, size) => (
        <FileThumbnail
            key={file.id}
            file={{ fileName: file.fileName, mimeType: file.mimeType }}
            cacheKey={makeCacheKey(file)}
            fetchBlob={makeFetchBlob(file)}
            onClick={() => onPreview(file)}
            size={size}
        />
    );

    return (
        <div className="file-thumb-strip">
            {shown.map((f) => thumb(f, 40))}
            {extra > 0 && (
                <button
                    type="button"
                    className="file-thumb__more"
                    aria-label={`Show ${extra} more file${extra !== 1 ? 's' : ''}`}
                    title={`Show ${extra} more`}
                    onClick={() => setGalleryOpen(true)}
                >
                    +{extra}
                </button>
            )}
            {galleryOpen && (
                <Modal onClose={() => setGalleryOpen(false)}>
                    <h2 className="modal__title" style={{ marginBottom: 12 }}>{files.length} file{files.length !== 1 ? 's' : ''}</h2>
                    <div className="file-thumb-gallery">
                        {files.map((f) => (
                            <div key={f.id} className="file-thumb-gallery__tile">
                                {thumb(f, 72)}
                                <div className="file-thumb-gallery__name" title={f.fileName}>{f.fileName}</div>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
}
