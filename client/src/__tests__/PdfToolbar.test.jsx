import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PdfToolbar from '../components/pdf/PdfToolbar';

const baseProps = {
    activeTool: 'select', setActiveTool: () => {},
    toolOptions: { fontSize: 16, color: '#000', strokeWidth: 2, highlightColor: '#FF0' },
    setToolOptions: () => {},
    canUndo: false, canRedo: false, onUndo: () => {}, onRedo: () => {},
    zoom: 1, setZoom: () => {},
    currentPage: 1, totalPages: 1, onPageChange: () => {},
    onSave: () => {}, onSaveAs: () => {}, onClose: () => {},
    saving: false, hasChanges: true,
};

describe('PdfToolbar Save as Final', () => {
    it('shows Save as Final and calls onSaveAsFinal when the PDF has form fields', () => {
        const onSaveAsFinal = vi.fn();
        render(<PdfToolbar {...baseProps} hasFormFields onSaveAsFinal={onSaveAsFinal} />);
        const btn = screen.getByRole('button', { name: /save as final/i });
        fireEvent.click(btn);
        expect(onSaveAsFinal).toHaveBeenCalledTimes(1);
    });

    it('hides Save as Final when there are no form fields', () => {
        render(<PdfToolbar {...baseProps} hasFormFields={false} onSaveAsFinal={() => {}} />);
        expect(screen.queryByRole('button', { name: /save as final/i })).toBeNull();
    });
});
