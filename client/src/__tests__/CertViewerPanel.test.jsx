import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CertViewerPanel from '../components/common/CertViewerPanel';

vi.mock('../components/common/DocViewer', () => ({ default: ({ fileName, extraToolbarActions }) => (
  <div data-testid="docviewer">{fileName}{extraToolbarActions}</div>
) }));

describe('CertViewerPanel', () => {
  it('shows the empty state when no file is selected', () => {
    render(<CertViewerPanel />);
    expect(screen.getByText(/select a certification/i)).toBeInTheDocument();
    expect(screen.queryByTestId('docviewer')).not.toBeInTheDocument();
  });

  it('renders the selected file name + DocViewer', () => {
    render(<CertViewerPanel fileName="cpr.pdf" fetchBlob={vi.fn()} status="Active" statusClass="submitted" />);
    expect(screen.getByTestId('docviewer')).toHaveTextContent('cpr.pdf');
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('fires onHistory and onReplace from the toolbar actions', () => {
    const onHistory = vi.fn(), onReplace = vi.fn();
    render(<CertViewerPanel fileName="cpr.pdf" fetchBlob={vi.fn()} onHistory={onHistory} onReplace={onReplace} />);
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    fireEvent.click(screen.getByRole('button', { name: /replace|upload/i }));
    expect(onHistory).toHaveBeenCalled();
    expect(onReplace).toHaveBeenCalled();
  });
});
