// client/src/__tests__/PreviewModal.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PreviewModal from '../components/common/PreviewModal';

// pdf.js can't run under jsdom — stub the document loader so PDF paths resolve
// to a deterministic 2-page doc without touching a real worker/canvas render.
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
  // jsdom canvas has no 2d context by default
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ setTransform: vi.fn() }));
});

function mockResponse({ type = 'application/pdf', length = '1024' } = {}) {
  return {
    ok: true,
    headers: { get: (h) => (h === 'Content-Type' ? type : h === 'Content-Length' ? length : null) },
    blob: async () => {
      const b = new Blob(['x'], { type });
      b.arrayBuffer = async () => new ArrayBuffer(8);
      return b;
    },
  };
}

describe('PreviewModal', () => {
  it('renders nothing when closed', () => {
    render(<PreviewModal open={false} fileName="a.pdf" fetchBlob={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a canvas + page controls for a multi-page PDF', async () => {
    render(
      <PreviewModal open fileName="a.pdf" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(document.querySelector('.doc-viewer__canvas')).toBeInTheDocument());
    // 2-page doc → page nav shows "1 / 2"
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('renders an img for an image', async () => {
    render(
      <PreviewModal open fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('shows a download fallback for unpreviewable types', async () => {
    render(
      <PreviewModal open fileName="a.docx" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument());
    expect(document.querySelector('.doc-viewer__canvas')).not.toBeInTheDocument();
  });

  it('shows the download fallback when the file exceeds maxBytes', async () => {
    render(
      <PreviewModal open fileName="big.pdf" maxBytes={512} fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf', length: '99999' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
    expect(document.querySelector('.doc-viewer__canvas')).not.toBeInTheDocument();
  });

  it('renders a Delete control only when onDelete is provided', async () => {
    const onDelete = vi.fn();
    const { rerender } = render(
      <PreviewModal open fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} onClose={vi.fn()} onDelete={onDelete} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());

    rerender(
      <PreviewModal open fileName="a.png" fetchBlob={() => Promise.resolve(mockResponse({ type: 'image/png' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
