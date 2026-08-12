// client/src/components/common/FileThumbnail.jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFileThumbnail } from '../../hooks/useFileThumbnail';
import { FileTypeIcon } from '../files/fileTypeUtils';

// Popover geometry: 240px image max + padding + caption ≈ 260px tall.
const POPOVER_HEIGHT = 260;
const POPOVER_WIDTH = 240;
const GAP = 8;

export default function FileThumbnail({ file, cacheKey, fetchBlob, onClick, size = 40 }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    const [hover, setHover] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    // Fixed-position coordinates for the portalled popover (viewport-relative).
    const [pos, setPos] = useState(null);

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

    // Compute where the popover should sit, clamped to the viewport so it is
    // never clipped by a side panel / overflow container. Rendered in a portal
    // to document.body, so no ancestor overflow or stacking context applies.
    const computePosition = () => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        let left = centerX - POPOVER_WIDTH / 2;
        left = Math.max(GAP, Math.min(left, window.innerWidth - POPOVER_WIDTH - GAP));

        const spaceAbove = rect.top;
        const below = spaceAbove < POPOVER_HEIGHT + GAP;
        const top = below ? rect.bottom + GAP : rect.top - GAP;
        setPos({ left, top, below });
    };

    const closePopover = () => setHover(false);

    // Reposition on scroll/resize while open; close on scroll to avoid a stale
    // floating card (matches typical hover-preview behaviour).
    useEffect(() => {
        if (!hover) return;
        const onScroll = () => closePopover();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', closePopover);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', closePopover);
        };
    }, [hover]);

    const popover = hover && pos ? createPortal(
        <span
            className={`file-thumb__popover file-thumb__popover--open${pos.below ? ' file-thumb__popover--below' : ''}`}
            role="tooltip"
            aria-hidden="true"
            style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                transform: pos.below ? 'none' : 'translateY(-100%)',
            }}
        >
            {showImg ? (
                <img className="file-thumb__popover-img" src={thumbUrl} alt="" aria-hidden="true" />
            ) : (
                <span className="file-thumb__popover-icon"><FileTypeIcon fileName={file.fileName} size={48} /></span>
            )}
            <div className="file-thumb__popover-name">{file.fileName}</div>
        </span>,
        document.body
    ) : null;

    return (
        <button
            ref={ref}
            type="button"
            className="file-thumb"
            style={{ '--thumb-size': `${size}px` }}
            aria-label={`Preview ${file.fileName}`}
            title={file.fileName}
            onClick={() => onClick(file)}
            onMouseEnter={() => { computePosition(); setHover(true); }}
            onMouseLeave={closePopover}
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
            {popover}
        </button>
    );
}
