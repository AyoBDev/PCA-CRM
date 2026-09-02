import { useEffect } from 'react';
import { computeFitScale } from '../utils/pdfFit';

// Keeps a PDF page fit to the width of its scroll container. Observes the
// container's real laid-out width via ResizeObserver (fires once the
// container is actually measured, and again on every resize) and calls
// setZoom(fit) — until userZoomedRef.current becomes true, at which point
// auto-fit stops for the session so it never fights a manual zoom.
//
// containerRef: ref to the scrollable element whose width drives the fit
// pages: array of pdf.js page proxies (only pages[0] is used, for its
//   unscaled viewport width)
// userZoomedRef: ref<boolean> — true once the user has manually zoomed
// setZoom: setter to apply the computed fit scale
export function useFitToWidth(containerRef, pages, userZoomedRef, setZoom) {
    useEffect(() => {
        const el = containerRef.current;
        if (!el || !pages.length) return undefined;
        if (typeof ResizeObserver === 'undefined') return undefined;

        const pageWidth = pages[0].getViewport({ scale: 1 }).width;

        const applyFit = (width) => {
            if (userZoomedRef.current) return;
            if (!(width > 0)) return;
            const fit = computeFitScale(width, pageWidth);
            setZoom(fit);
        };

        // Initial measure in case the observer's first callback is delayed.
        applyFit(el.clientWidth);

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentBoxSize
                    ? el.clientWidth
                    : entry.contentRect.width;
                applyFit(width);
            }
        });
        observer.observe(el);

        return () => observer.disconnect();
    }, [containerRef, pages, userZoomedRef, setZoom]);
}
