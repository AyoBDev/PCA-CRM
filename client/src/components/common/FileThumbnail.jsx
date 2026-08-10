// client/src/components/common/FileThumbnail.jsx
import { useEffect, useRef, useState } from 'react';
import { useFileThumbnail } from '../../hooks/useFileThumbnail';
import { FileTypeIcon } from '../files/fileTypeUtils';

// Popover geometry: 240px image max + padding + caption ≈ 260px tall (see .file-thumb__popover in index.css).
const POPOVER_HEIGHT = 260;

export default function FileThumbnail({ file, cacheKey, fetchBlob, onClick, size = 40 }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    const [hover, setHover] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [placement, setPlacement] = useState('above');

    useEffect(() => {
        if (visible || !ref.current) return;
        const obs = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) { setVisible(true); obs.disconnect(); }
        });
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, [visible]);

    const { status, thumbUrl } = useFileThumbnail(cacheKey, fetchBlob, file.mimeType, { enabled: visible });
    const showImg = status === 'ready' && thumbUrl;

    return (
        <button
            ref={ref}
            type="button"
            className="file-thumb"
            style={{ '--thumb-size': `${size}px` }}
            aria-label={`Preview ${file.fileName}`}
            title={file.fileName}
            onClick={() => onClick(file)}
            onMouseEnter={() => {
                if (ref.current) {
                    const rect = ref.current.getBoundingClientRect();
                    // Measure available room ABOVE the thumbnail against the top of its
                    // list/card container (not the viewport) — a popover anchored above
                    // overflows once it would rise past that boundary.
                    const container = ref.current.closest('.file-list, .cp-card, main');
                    const boundaryTop = container ? container.getBoundingClientRect().top : 0;
                    const spaceAbove = rect.top - boundaryTop;
                    setPlacement(spaceAbove < POPOVER_HEIGHT + 16 ? 'below' : 'above');
                }
                setHover(true);
            }}
            onMouseLeave={() => setHover(false)}
        >
            {showImg ? (
                <img
                    className={`file-thumb__img${imgLoaded ? ' file-thumb__img--loaded' : ''}`}
                    src={thumbUrl}
                    alt={file.fileName}
                    onLoad={() => setImgLoaded(true)}
                />
            ) : status === 'loading' ? (
                <span className="file-thumb__placeholder" aria-hidden="true" />
            ) : (
                <span className="file-thumb__fallback">
                    <FileTypeIcon fileName={file.fileName} size={Math.round(size * 0.6)} />
                </span>
            )}
            <span className={`file-thumb__popover${hover ? ' file-thumb__popover--open' : ''}${placement === 'below' ? ' file-thumb__popover--below' : ''}`} role="tooltip" aria-hidden="true">
                {showImg ? (
                    <img className="file-thumb__popover-img" src={thumbUrl} alt="" aria-hidden="true" />
                ) : (
                    <span className="file-thumb__popover-icon"><FileTypeIcon fileName={file.fileName} size={48} /></span>
                )}
                <div className="file-thumb__popover-name">{file.fileName}</div>
            </span>
        </button>
    );
}
