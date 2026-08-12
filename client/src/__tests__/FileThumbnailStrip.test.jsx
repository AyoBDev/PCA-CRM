// client/src/__tests__/FileThumbnailStrip.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Render a simple stand-in for FileThumbnail so we can assert wiring.
vi.mock('../components/common/FileThumbnail', () => ({
  default: ({ file, onClick }) => (
    <button data-testid="thumb" onClick={() => onClick(file)}>{file.fileName}</button>
  ),
}));

import FileThumbnailStrip from '../components/common/FileThumbnailStrip';

const files = [
  { id: 1, fileName: 'a.png', mimeType: 'image/png' },
  { id: 2, fileName: 'b.pdf', mimeType: 'application/pdf' },
  { id: 3, fileName: 'c.jpg', mimeType: 'image/jpeg' },
];
const props = {
  makeCacheKey: (f) => 'k:' + f.id,
  makeFetchBlob: () => () => Promise.resolve({}),
};

describe('FileThumbnailStrip', () => {
  it('renders nothing for empty files', () => {
    const { container } = render(<FileThumbnailStrip files={[]} {...props} onPreview={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('one file → single thumb, no +N badge', () => {
    render(<FileThumbnailStrip files={[files[0]]} {...props} onPreview={vi.fn()} />);
    expect(screen.getAllByTestId('thumb')).toHaveLength(1);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('N>max → first thumb + "+2" badge', () => {
    render(<FileThumbnailStrip files={files} {...props} onPreview={vi.fn()} max={1} />);
    expect(screen.getAllByTestId('thumb')).toHaveLength(1);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('clicking a thumbnail fires onPreview(file)', () => {
    const onPreview = vi.fn();
    render(<FileThumbnailStrip files={[files[0]]} {...props} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId('thumb'));
    expect(onPreview).toHaveBeenCalledWith(files[0]);
  });

  it('clicking +N opens the gallery with all files', () => {
    render(<FileThumbnailStrip files={files} {...props} onPreview={vi.fn()} max={1} />);
    fireEvent.click(screen.getByText('+2'));
    // gallery now shows all 3 thumbs
    expect(screen.getAllByTestId('thumb').length).toBeGreaterThanOrEqual(3);
  });
});
