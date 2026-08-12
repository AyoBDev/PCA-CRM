// client/src/__tests__/useFileThumbnail.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/pdfThumbnail', () => ({
  renderPdfFirstPage: vi.fn(() => Promise.resolve('data:image/png;base64,PDF')),
}));
import { renderPdfFirstPage } from '../lib/pdfThumbnail';
import { useFileThumbnail, __clearThumbnailCache } from '../hooks/useFileThumbnail';

function resp({ type, size = 100 }) {
  return {
    ok: true,
    headers: { get: (h) => (h === 'Content-Type' ? type : null) },
    blob: async () => ({ type, size, arrayBuffer: async () => new ArrayBuffer(size) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearThumbnailCache();
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
});

describe('useFileThumbnail', () => {
  it('returns an object URL for an image', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'image/png' })));
    const { result } = renderHook(() => useFileThumbnail('file:1', fetchBlob, 'image/png'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.thumbUrl).toBe('blob:mock');
  });

  it('renders a PDF via renderPdfFirstPage', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'application/pdf' })));
    const { result } = renderHook(() => useFileThumbnail('file:2', fetchBlob, 'application/pdf'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(renderPdfFirstPage).toHaveBeenCalled();
    expect(result.current.thumbUrl).toBe('data:image/png;base64,PDF');
  });

  it('returns icon for an oversized PDF without rendering', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'application/pdf', size: 99 * 1024 * 1024 })));
    const { result } = renderHook(() => useFileThumbnail('file:3', fetchBlob, 'application/pdf', { maxPdfBytes: 1024 }));
    await waitFor(() => expect(result.current.status).toBe('icon'));
    expect(renderPdfFirstPage).not.toHaveBeenCalled();
  });

  it('returns icon for an unknown type', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'application/vnd.ms-excel' })));
    const { result } = renderHook(() => useFileThumbnail('file:4', fetchBlob, 'application/vnd.ms-excel'));
    await waitFor(() => expect(result.current.status).toBe('icon'));
  });

  it('returns icon when fetchBlob rejects', async () => {
    const fetchBlob = vi.fn(() => Promise.reject(new Error('net')));
    const { result } = renderHook(() => useFileThumbnail('file:5', fetchBlob, 'image/png'));
    await waitFor(() => expect(result.current.status).toBe('icon'));
  });

  it('serves a cached result without calling fetchBlob again', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'image/png' })));
    const { result: r1 } = renderHook(() => useFileThumbnail('file:6', fetchBlob, 'image/png'));
    await waitFor(() => expect(r1.current.status).toBe('ready'));
    const { result: r2 } = renderHook(() => useFileThumbnail('file:6', fetchBlob, 'image/png'));
    await waitFor(() => expect(r2.current.status).toBe('ready'));
    expect(fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const fetchBlob = vi.fn(() => Promise.resolve(resp({ type: 'image/png' })));
    const { result } = renderHook(() => useFileThumbnail('file:7', fetchBlob, 'image/png', { enabled: false }));
    expect(result.current.status).toBe('idle');
    expect(fetchBlob).not.toHaveBeenCalled();
  });
});
