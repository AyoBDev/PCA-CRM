// Compute a fit-to-width render scale for a PDF page, matching DocViewer's
// approach: (containerWidth - padding) / pageWidth, clamped to [min, max].
// Returns 1 as a safe default when dimensions aren't known yet.
export function computeFitScale(containerWidth, pageWidth, { padding = 48, min = 0.5, max = 3 } = {}) {
    if (!(containerWidth > 0) || !(pageWidth > 0)) return 1;
    const scale = (containerWidth - padding) / pageWidth;
    if (!(scale > 0)) return min;
    return Math.min(max, Math.max(min, scale));
}
