// client/src/__tests__/FileThumbnail.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let observeCb;
beforeEach(() => {
  // IntersectionObserver stub that we can trigger manually
  observeCb = null;
  global.IntersectionObserver = class {
    constructor(cb) { observeCb = cb; }
    observe() {}
    disconnect() {}
  };
});

vi.mock('../hooks/useFileThumbnail', () => ({
  useFileThumbnail: vi.fn((key, fetchBlob, mime, opts) =>
    opts?.enabled ? { status: 'ready', thumbUrl: 'blob:img' } : { status: 'idle', thumbUrl: null }
  ),
}));

import FileThumbnail from '../components/common/FileThumbnail';

const file = { fileName: 'scan.png', mimeType: 'image/png' };

describe('FileThumbnail', () => {
  it('shows the typed-icon fallback before it becomes visible (no img)', () => {
    render(<FileThumbnail file={file} cacheKey="file:1" fetchBlob={vi.fn()} onClick={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders an img once visible + ready', async () => {
    render(<FileThumbnail file={file} cacheKey="file:1" fetchBlob={vi.fn()} onClick={vi.fn()} />);
    // trigger intersection
    observeCb([{ isIntersecting: true }]);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  });

  it('fires onClick(file) when clicked', () => {
    const onClick = vi.fn();
    render(<FileThumbnail file={file} cacheKey="file:1" fetchBlob={vi.fn()} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(file);
  });
});
