import { renderHook, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../hooks/useToast';

describe('useToast', () => {
    test('showToast sets toast state', () => {
        const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;
        const { result } = renderHook(() => useToast(), { wrapper });

        act(() => { result.current.showToast('Test message', 'success'); });
        expect(result.current.toast).toEqual({ message: 'Test message', type: 'success' });
    });

    test('clearToast removes toast', () => {
        const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;
        const { result } = renderHook(() => useToast(), { wrapper });

        act(() => { result.current.showToast('Test', 'success'); });
        act(() => { result.current.clearToast(); });
        expect(result.current.toast).toBeNull();
    });
});
