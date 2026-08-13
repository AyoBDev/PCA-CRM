// client/src/__tests__/DocViewer.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocViewer from '../components/common/DocViewer';

vi.mock('../lib/pdfThumbnail', () => ({
  loadPdfDocument: vi.fn(async () => ({
    numPages: 2,
    getPage: async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    }),
    destroy: () => {},
  })),
}));

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ setTransform: vi.fn() }));
});

function mockResponse({ type = 'application/pdf', length = '1024' } = {}) {
  return {
    ok: true,
    headers: { get: (h) => (h === 'Content-Type' ? type : h === 'Content-Length' ? length : null) },
    blob: async () => { const b = new Blob(['x'], { type }); b.arrayBuffer = async () => new ArrayBuffer(8); return b; },
  };
}

describe('DocViewer', () => {
  it('renders a canvas + page controls for a multi-page PDF', async () => {
    render(<DocViewer fileName="a.pdf" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf' }))} />);
    await waitFor(() => expect(document.querySelector('.doc-viewer__canvas')).toBeInTheDocument());
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('renders an img for an image', async () => {
    render(<DocViewer fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('shows a download fallback for unpreviewable types', async () => {
    render(<DocViewer fileName="a.docx" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/msword' }))} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument());
    expect(document.querySelector('.doc-viewer__canvas')).not.toBeInTheDocument();
  });

  it('shows the download fallback when the file exceeds maxBytes', async () => {
    render(<DocViewer fileName="big.pdf" maxBytes={512} fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf', length: '99999' }))} />);
    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
  });

  it('renders extraToolbarActions', async () => {
    render(<DocViewer fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} extraToolbarActions={<button>Expand</button>} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument());
  });

  it('hides the toolbar when showToolbar is false', async () => {
    render(<DocViewer fileName="a.png" showToolbar={false} fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(document.querySelector('.doc-viewer__toolbar')).not.toBeInTheDocument();
  });
});
