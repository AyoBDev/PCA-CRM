// client/src/hooks/useFileThumbnail.js
import { useEffect, useState } from 'react';
import { renderPdfFirstPage } from '../lib/pdfThumbnail';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_CACHE = 200;
const cache = new Map(); // cacheKey -> { status, thumbUrl }

export function __clearThumbnailCache() {
    for (const v of cache.values()) {
        if (v.thumbUrl && v.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(v.thumbUrl);
    }
    cache.clear();
}

function cacheSet(key, value) {
    if (cache.size >= MAX_CACHE) {
        const oldestKey = cache.keys().next().value;
        const old = cache.get(oldestKey);
        if (old?.thumbUrl && old.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(old.thumbUrl);
        cache.delete(oldestKey);
    }
    cache.set(key, value);
}

export function useFileThumbnail(cacheKey, fetchBlob, mimeType, { enabled = true, maxPdfBytes = 10 * 1024 * 1024 } = {}) {
    const [state, setState] = useState(() => cache.get(cacheKey) || { status: 'idle', thumbUrl: null });

    useEffect(() => {
        if (!enabled) return;
        const cached = cache.get(cacheKey);
        if (cached) { setState(cached); return; }

        let cancelled = false;
        setState({ status: 'loading', thumbUrl: null });
        (async () => {
            let result = { status: 'icon', thumbUrl: null };
            try {
                const res = await fetchBlob();
                if (!res.ok) throw new Error('fetch failed');
                const blob = await res.blob();
                const type = (res.headers.get('Content-Type') || mimeType || blob.type || '').split(';')[0];
                if (IMAGE_TYPES.includes(type)) {
                    result = { status: 'ready', thumbUrl: URL.createObjectURL(blob) };
                } else if (type === 'application/pdf' && blob.size <= maxPdfBytes) {
                    const buf = await blob.arrayBuffer();
                    const url = await renderPdfFirstPage(buf, 96);
                    result = { status: 'ready', thumbUrl: url };
                } else {
                    result = { status: 'icon', thumbUrl: null };
                }
            } catch {
                result = { status: 'icon', thumbUrl: null };
            }
            if (cancelled) {
                if (result.thumbUrl && result.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(result.thumbUrl);
                return;
            }
            cacheSet(cacheKey, result);
            setState(result);
        })();
        return () => { cancelled = true; };
    }, [cacheKey, enabled, fetchBlob, mimeType, maxPdfBytes]);

    return state;
}
