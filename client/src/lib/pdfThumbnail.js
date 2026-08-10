let workerConfigured = false;

export async function renderPdfFirstPage(arrayBuffer, targetPx = 96) {
    const pdfjs = await import('pdfjs-dist');
    if (!workerConfigured) {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        workerConfigured = true;
    }
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = targetPx / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/png');
    } finally {
        pdf.destroy();
    }
}
