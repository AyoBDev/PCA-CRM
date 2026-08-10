import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist BEFORE importing the helper.
const mockRender = vi.fn(() => ({ promise: Promise.resolve() }));
const mockGetViewport = vi.fn(() => ({ width: 200, height: 260 }));
const mockDestroy = vi.fn();
const mockGetPage = vi.fn(() => Promise.resolve({ getViewport: mockGetViewport, render: mockRender }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ getPage: mockGetPage, destroy: mockDestroy, numPages: 3 }) })),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom canvas: stub getContext + toDataURL
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK');
});

import { renderPdfFirstPage } from '../lib/pdfThumbnail';

describe('renderPdfFirstPage', () => {
  it('renders page 1 to a PNG data URL and destroys the doc', async () => {
    const url = await renderPdfFirstPage(new ArrayBuffer(8), 96);
    expect(url).toBe('data:image/png;base64,MOCK');
    expect(mockGetPage).toHaveBeenCalledWith(1);
    expect(mockRender).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('rejects when pdfjs throws', async () => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('bad pdf')) });
    await expect(renderPdfFirstPage(new ArrayBuffer(8))).rejects.toThrow();
  });
});
