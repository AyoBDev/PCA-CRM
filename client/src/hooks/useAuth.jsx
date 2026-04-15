import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Auth check on mount
    useEffect(() => {
        const token = api.getToken();
        if (!token) { setLoading(false); return; }
        api.getMe()
            .then((u) => setUser(u))
            .catch(() => { api.clearToken(); })
            .finally(() => setLoading(false));
    }, []);

    // Listen for 401 logout events from api.js
    useEffect(() => {
        const handler = () => { setUser(null); };
        window.addEventListener('auth:logout', handler);
        return () => window.removeEventListener('auth:logout', handler);
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await api.login(email, password);
        api.setToken(res.token);
        setUser(res.user);
        return res.user;
    }, []);

    const logout = useCallback(() => {
        api.clearToken();
        setUser(null);
    }, []);

    const isAdmin = user?.role === 'admin';
    const isStaff = user?.role === 'admin' || user?.role === 'user';

    return (
        <AuthContext.Provider value={{ user, isAdmin, isStaff, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
