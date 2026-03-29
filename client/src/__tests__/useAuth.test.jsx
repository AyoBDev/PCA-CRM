import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../hooks/useAuth';

// Mock api module to avoid actual fetch calls
vi.mock('../api', () => ({
    getToken: () => null,
    setToken: vi.fn(),
    clearToken: vi.fn(),
    getMe: vi.fn(),
    login: vi.fn(),
}));

describe('useAuth', () => {
    test('starts with null user and loading true', () => {
        const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });
        expect(result.current.user).toBeNull();
        expect(result.current.isAdmin).toBe(false);
    });
});
