// client/src/__tests__/PreviewModal.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PreviewModal from '../components/common/PreviewModal';

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
});

function mockResponse({ type = 'application/pdf', length = '1024' } = {}) {
  return {
    ok: true,
    headers: { get: (h) => (h === 'Content-Type' ? type : h === 'Content-Length' ? length : null) },
    blob: async () => new Blob(['x'], { type }),
  };
}

describe('PreviewModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <PreviewModal open={false} fileName="a.pdf" fetchBlob={vi.fn()} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an iframe for a PDF', async () => {
    render(
      <PreviewModal open fileName="a.pdf" fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByTitle('preview')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText(/download/i)).toBeInTheDocument());
    expect(screen.queryByTitle('preview')).not.toBeInTheDocument();
  });

  it('shows the download fallback when the file exceeds maxBytes', async () => {
    render(
      <PreviewModal open fileName="big.pdf" maxBytes={512} fetchBlob={() => Promise.resolve(mockResponse({ type: 'application/pdf', length: '99999' }))} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText(/download/i)).toBeInTheDocument());
    expect(screen.queryByTitle('preview')).not.toBeInTheDocument();
  });
});
