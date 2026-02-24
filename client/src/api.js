const BASE = '/api';

// ── Token management ──
let authToken = localStorage.getItem('token') || null;

export function setToken(token) {
    authToken = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
}

export function getToken() {
    return authToken;
}

export function clearToken() {
    authToken = null;
    localStorage.removeItem('token');
}

// ── Base request helper ──
async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${BASE}${path}`, { headers, ...options });

    if (res.status === 401) {
        clearToken();
        window.dispatchEvent(new Event('auth:logout'));
        throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.errors?.join(', ') || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

// ── Auth ──
export const login = (email, password) =>
    fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Login failed');
        }
        return res.json();
    });

export const getMe = () => request('/auth/me');
export const registerUser = (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const getUsers = () => request('/auth/users');
export const deleteUser = (id) =>
    request(`/auth/users/${id}`, { method: 'DELETE' });

// Clients
export const getClients = () => request('/clients');
export const getClient = (id) => request(`/clients/${id}`);
export const createClient = (clientName, extra = {}) =>
    request('/clients', { method: 'POST', body: JSON.stringify({ clientName, ...extra }) });
export const updateClient = (id, clientName, extra = {}) =>
    request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify({ clientName, ...extra }) });
export const deleteClient = (id) =>
    request(`/clients/${id}`, { method: 'DELETE' });

// Bulk Import
export const bulkImport = (clients) =>
    request('/clients/bulk-import', { method: 'POST', body: JSON.stringify({ clients }) });

// Authorizations
export const createAuthorization = (clientId, data) =>
    request(`/clients/${clientId}/authorizations`, { method: 'POST', body: JSON.stringify(data) });
export const updateAuthorization = (id, data) =>
    request(`/authorizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAuthorization = (id) =>
    request(`/authorizations/${id}`, { method: 'DELETE' });

// Insurance Types
export const getInsuranceTypes = () => request('/insurance-types');
export const createInsuranceType = (data) =>
    request('/insurance-types', { method: 'POST', body: JSON.stringify(data) });
export const updateInsuranceType = (id, data) =>
    request(`/insurance-types/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInsuranceType = (id) =>
    request(`/insurance-types/${id}`, { method: 'DELETE' });

// Services
export const getServices = () => request('/services');
export const createService = (data) =>
    request('/services', { method: 'POST', body: JSON.stringify(data) });
export const updateService = (id, data) =>
    request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteService = (id) =>
    request(`/services/${id}`, { method: 'DELETE' });

// Timesheets
export const getTimesheets = (params = '') => request(`/timesheets${params ? '?' + params : ''}`);
export const getTimesheet = (id) => request(`/timesheets/${id}`);
export const getActivities = () => request('/timesheets/activities');
export const createTimesheet = (data) =>
    request('/timesheets', { method: 'POST', body: JSON.stringify(data) });
export const updateTimesheet = (id, data) =>
    request(`/timesheets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const submitTimesheet = (id) =>
    request(`/timesheets/${id}/submit`, { method: 'PUT' });
export const deleteTimesheet = (id) =>
    request(`/timesheets/${id}`, { method: 'DELETE' });

// Signing Links
export const generateSigningLinks = (timesheetId) =>
    request(`/timesheets/${timesheetId}/signing-links`, { method: 'POST' });

export const getSigningForm = (token) =>
    fetch(`${BASE}/sign/${token}`).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    });

export const submitSigningForm = (token, data) =>
    fetch(`${BASE}/sign/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    });
