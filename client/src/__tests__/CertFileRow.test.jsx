import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CertFileRow from '../components/files/CertFileRow';

vi.mock('../components/common/FileThumbnail', () => ({ default: () => <div data-testid="thumb" /> }));

const upload = { id: 1, fileName: 'a.pdf', fileType: 'application/pdf' };

describe('CertFileRow', () => {
  it('adds is-selected when selected', () => {
    const { container } = render(<CertFileRow upload={upload} onPreview={vi.fn()} onDownload={vi.fn()} selected />);
    expect(container.querySelector('.file-row--cert.is-selected')).toBeInTheDocument();
  });

  it('calls onSelect when the row body is clicked', () => {
    const onSelect = vi.fn();
    render(<CertFileRow upload={upload} onPreview={vi.fn()} onDownload={vi.fn()} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('a.pdf'));
    expect(onSelect).toHaveBeenCalledWith(upload);
  });

  it('does not call onSelect when Download is clicked', () => {
    const onSelect = vi.fn(); const onDownload = vi.fn();
    render(<CertFileRow upload={upload} onPreview={vi.fn()} onDownload={onDownload} onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle('Download'));
    expect(onDownload).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
