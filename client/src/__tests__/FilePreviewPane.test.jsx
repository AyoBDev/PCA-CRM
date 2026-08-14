import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FilePreviewPane from '../components/common/FilePreviewPane';

vi.mock('../components/common/FileThumbnail', () => ({ default: () => <div data-testid="thumb" /> }));
vi.mock('../components/common/DocViewer', () => ({ default: ({ fileName }) => <div data-testid="docviewer">{fileName}</div> }));

let wide = true;
vi.mock('../hooks/useIsWide', () => ({ useIsWide: () => wide }));

const items = [
  { id: 'a', fileName: 'a.pdf', fileType: 'application/pdf', fetchBlob: vi.fn() },
  { id: 'b', fileName: 'b.png', fileType: 'image/png', fetchBlob: vi.fn() },
];

beforeEach(() => { wide = true; });

describe('FilePreviewPane', () => {
  it('renders a row per item', () => {
    render(<FilePreviewPane items={items} selectedId={null} onSelect={vi.fn()} open={false} onExpand={vi.fn()} />);
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();
  });

  it('does not render the panel when open is false', () => {
    render(<FilePreviewPane items={items} selectedId="a" onSelect={vi.fn()} open={false} onExpand={vi.fn()} />);
    expect(screen.queryByTestId('docviewer')).not.toBeInTheDocument();
  });

  it('shows the selected item in the panel when open on a wide screen', () => {
    render(<FilePreviewPane items={items} selectedId="a" onSelect={vi.fn()} open onExpand={vi.fn()} />);
    expect(screen.getByTestId('docviewer')).toHaveTextContent('a.pdf');
  });

  it('selecting a row calls onSelect on a wide screen', () => {
    const onSelect = vi.fn();
    render(<FilePreviewPane items={items} selectedId={null} onSelect={onSelect} open onExpand={vi.fn()} />);
    fireEvent.click(screen.getByText('b.png'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('the Preview button docks inline (onSelect), NOT full-screen (onExpand), when docked', () => {
    const onSelect = vi.fn(), onExpand = vi.fn();
    render(<FilePreviewPane items={items} selectedId={null} onSelect={onSelect} open onExpand={onExpand} />);
    // CertFileRow renders a Preview button titled "Preview" per item
    fireEvent.click(screen.getAllByTitle('Preview')[1]);
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('on a narrow screen, row click calls onExpand and no panel renders', () => {
    wide = false;
    const onExpand = vi.fn();
    render(<FilePreviewPane items={items} selectedId={null} onSelect={vi.fn()} open onExpand={onExpand} />);
    fireEvent.click(screen.getByText('a.pdf'));
    expect(onExpand).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByTestId('docviewer')).not.toBeInTheDocument();
  });
});
