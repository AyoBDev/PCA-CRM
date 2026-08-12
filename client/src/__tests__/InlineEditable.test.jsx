import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../hooks/useToast';
import Toast from '../components/layout/Toast';
import InlineEditable from '../components/common/InlineEditable';

function renderInline(props = {}) {
    const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined);
    const utils = render(
        <ToastProvider>
            <Toast />
            <InlineEditable value="Hello" onSave={onSave} {...props} />
        </ToastProvider>
    );
    return { ...utils, onSave };
}

describe('InlineEditable', () => {
    test('read mode renders the value', () => {
        renderInline({ value: 'Hello' });
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('read mode renders the placeholder when value is empty', () => {
        renderInline({ value: '', placeholder: 'add note…' });
        expect(screen.getByText('add note…')).toBeInTheDocument();
    });

    test('clicking the value text does not enter edit mode', () => {
        renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByText('Hello'));
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('clicking the pencil (title="Edit") enters edit mode', () => {
        renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByTitle('Edit'));
        expect(screen.getByRole('textbox')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveValue('Hello');
    });

    test('blur after typing does NOT call onSave and returns to read mode with original value', async () => {
        const { onSave } = renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByTitle('Edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Changed' } });
        fireEvent.blur(input);

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    test('pressing Enter after typing calls onSave with the trimmed new value', async () => {
        const { onSave } = renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByTitle('Edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '  Changed  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onSave).toHaveBeenCalledWith('Changed');
    });

    test('clicking the Save button (title="Save") calls onSave', async () => {
        const { onSave } = renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByTitle('Edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Changed' } });
        // buttons use onMouseDown so it fires before the input's onBlur cancel
        fireEvent.mouseDown(screen.getByTitle('Save'));

        expect(onSave).toHaveBeenCalledWith('Changed');
    });

    test('Escape cancels without calling onSave', () => {
        const { onSave } = renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByTitle('Edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Changed' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    test('clicking the Cancel button (title="Cancel") cancels without calling onSave', () => {
        const { onSave } = renderInline({ value: 'Hello' });
        fireEvent.click(screen.getByTitle('Edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Changed' } });
        fireEvent.mouseDown(screen.getByTitle('Cancel'));

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    describe('empty guard', () => {
        test('default (allowEmpty=false): clearing the field disables Save and shows an error; Enter does not save', () => {
            const { onSave } = renderInline({ value: 'Hello' });
            fireEvent.click(screen.getByTitle('Edit'));
            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: '' } });

            expect(screen.getByTitle('Save')).toBeDisabled();
            expect(screen.getByText('Cannot be empty')).toBeInTheDocument();

            fireEvent.keyDown(input, { key: 'Enter' });
            expect(onSave).not.toHaveBeenCalled();
        });

        test('allowEmpty=true: saving an empty value is allowed', () => {
            const { onSave } = renderInline({ value: 'Hello', allowEmpty: true });
            fireEvent.click(screen.getByTitle('Edit'));
            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: '' } });

            expect(screen.getByTitle('Save')).not.toBeDisabled();

            fireEvent.keyDown(input, { key: 'Enter' });
            expect(onSave).toHaveBeenCalledWith('');
        });
    });

    test('on successful save, a success toast is shown', async () => {
        renderInline({ value: 'Hello', undoLabel: 'name' });
        fireEvent.click(screen.getByTitle('Edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Changed' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(await screen.findByText('Updated name')).toBeInTheDocument();
    });

    describe('type="number" with min/max', () => {
        test('entering a value above max disables Save and shows the max error', () => {
            renderInline({ value: '5', type: 'number', min: 0, max: 112 });
            fireEvent.click(screen.getByTitle('Edit'));
            const input = screen.getByRole('spinbutton');
            fireEvent.change(input, { target: { value: '999' } });

            expect(screen.getByTitle('Save')).toBeDisabled();
            expect(screen.getByText('Max 112')).toBeInTheDocument();
        });

        test('a value within range enables Save with no error', () => {
            renderInline({ value: '5', type: 'number', min: 0, max: 112 });
            fireEvent.click(screen.getByTitle('Edit'));
            const input = screen.getByRole('spinbutton');
            fireEvent.change(input, { target: { value: '50' } });

            expect(screen.getByTitle('Save')).not.toBeDisabled();
        });
    });
});
