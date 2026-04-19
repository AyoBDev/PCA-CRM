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
        if (res.status === 409 && body.error === 'overlap') {
            const err = new Error(body.message || 'Overlap detected');
            err.isOverlap = true;
            err.conflicts = body.conflicts || [];
            throw err;
        }
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
export const getUsers = ({ archived } = {}) => request(`/auth/users${archived ? '?archived=true' : ''}`);
export const deleteUser = (id) =>
    request(`/auth/users/${id}`, { method: 'DELETE' });
export const restoreUser = (id) =>
    request(`/auth/users/${id}/restore`, { method: 'PUT' });

// Clients
export const getClients = ({ archived } = {}) => request(`/clients${archived ? '?archived=true' : ''}`);
export const getClient = (id) => request(`/clients/${id}`);
export const createClient = (clientName, extra = {}) =>
    request('/clients', { method: 'POST', body: JSON.stringify({ clientName, ...extra }) });
export const updateClient = (id, clientName, extra = {}) =>
    request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify({ clientName, ...extra }) });
export const patchClient = (id, data) =>
    request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteClient = (id) =>
    request(`/clients/${id}`, { method: 'DELETE' });
export const restoreClient = (id) =>
    request(`/clients/${id}/restore`, { method: 'PUT' });

// Bulk Import
export const bulkImport = (clients) =>
    request('/clients/bulk-import', { method: 'POST', body: JSON.stringify({ clients }) });

// Bulk Delete
export const bulkDeleteClients = (ids) =>
    request('/clients/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Authorizations
export const createAuthorization = (clientId, data) =>
    request(`/clients/${clientId}/authorizations`, { method: 'POST', body: JSON.stringify(data) });
export const updateAuthorization = (id, data) =>
    request(`/authorizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAuthorization = (id) =>
    request(`/authorizations/${id}`, { method: 'DELETE' });

// Insurance Types
export const getInsuranceTypes = ({ archived } = {}) => request(`/insurance-types${archived ? '?archived=true' : ''}`);
export const createInsuranceType = (data) =>
    request('/insurance-types', { method: 'POST', body: JSON.stringify(data) });
export const updateInsuranceType = (id, data) =>
    request(`/insurance-types/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInsuranceType = (id) =>
    request(`/insurance-types/${id}`, { method: 'DELETE' });
export const restoreInsuranceType = (id) =>
    request(`/insurance-types/${id}/restore`, { method: 'PUT' });

// Services
export const getServices = ({ archived } = {}) => request(`/services${archived ? '?archived=true' : ''}`);
export const createService = (data) =>
    request('/services', { method: 'POST', body: JSON.stringify(data) });
export const updateService = (id, data) =>
    request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteService = (id) =>
    request(`/services/${id}`, { method: 'DELETE' });
export const restoreService = (id) =>
    request(`/services/${id}/restore`, { method: 'PUT' });

// Timesheets
export const getTimesheets = (params = '', { archived } = {}) => {
    const parts = [params, archived ? 'archived=true' : ''].filter(Boolean).join('&');
    return request(`/timesheets${parts ? '?' + parts : ''}`);
};
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
export const restoreTimesheet = (id) =>
    request(`/timesheets/${id}/restore`, { method: 'PUT' });

// Timesheet Status (admin revert)
export const updateTimesheetStatus = (id, status) =>
    request(`/timesheets/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

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

// Permanent Links
export const getPermanentLinks = () => request('/permanent-links');
export const createPermanentLink = (data) => request('/permanent-links', { method: 'POST', body: JSON.stringify(data) });
export const deletePermanentLink = (id) => request(`/permanent-links/${id}`, { method: 'DELETE' });

// PCA Form (public — no auth token)
export async function getPcaForm(token, weekStart) {
  const qs = weekStart ? `?weekStart=${weekStart}` : '';
  const res = await fetch(`${BASE}/pca-form/${token}${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updatePcaForm(token, data) {
  const res = await fetch(`${BASE}/pca-form/${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Timesheet PDF Export
export const exportTimesheetPdf = (id) =>
    fetch(`${BASE}/timesheets/${id}/export-pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    });

// ── Payroll ──
export const getPayrollRuns   = ({ archived } = {})    => request(`/payroll/runs${archived ? '?archived=true' : ''}`);
export const getPayrollRun    = (id)  => request(`/payroll/runs/${id}`);
export const deletePayrollRun   = (id)  => request(`/payroll/runs/${id}`, { method: 'DELETE' });
export const restorePayrollRun  = (id)  => request(`/payroll/runs/${id}/restore`, { method: 'PUT' });
export const updatePayrollVisit = (id, data) =>
    request(`/payroll/visits/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Scheduling ──
export const getShifts = (weekStart, filters = {}) => {
    const params = new URLSearchParams();
    if (weekStart) params.set('weekStart', weekStart);
    if (filters.clientId) params.set('clientId', filters.clientId);
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    return request(`/shifts?${params.toString()}`);
};
export const createShift = (data) =>
    request('/shifts', { method: 'POST', body: JSON.stringify(data) });
export const updateShift = (id, data) =>
    request(`/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteShift = (id, { group } = {}) =>
    request(`/shifts/${id}${group ? '?group=true' : ''}`, { method: 'DELETE' });
export const restoreShift = (id) =>
    request(`/shifts/${id}/restore`, { method: 'PUT' });
export const deleteAllShifts = () =>
    request('/shifts/all', { method: 'DELETE' });
export const getClientSchedule = (clientId, weekStart) =>
    request(`/shifts/client/${clientId}${weekStart ? '?weekStart=' + weekStart : ''}`);
export const getEmployeeSchedule = (employeeId, weekStart) =>
    request(`/shifts/employee/${employeeId}${weekStart ? '?weekStart=' + weekStart : ''}`);
// ── Employees ──
export const getEmployees = (params = {}, { archived } = {}) => {
    if (archived) params.archived = 'true';
    const qs = new URLSearchParams(params).toString();
    return request(`/employees${qs ? '?' + qs : ''}`);
};
export const getEmployee = (id) => request(`/employees/${id}`);
export const createEmployee = (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) });
export const updateEmployee = (id, data) => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmployee = (id) => request(`/employees/${id}`, { method: 'DELETE' });
export const restoreEmployee = (id) => request(`/employees/${id}/restore`, { method: 'PUT' });

// ── Employee Schedule Links ──
export const getEmployeeScheduleLinks = () => request('/employee-schedule-links');
export const createEmployeeScheduleLink = (employeeId) =>
    request('/employee-schedule-links', { method: 'POST', body: JSON.stringify({ employeeId }) });
export const deleteEmployeeScheduleLink = (id) =>
    request(`/employee-schedule-links/${id}`, { method: 'DELETE' });

export async function getScheduleView(token, weekStart) {
    const qs = weekStart ? `?weekStart=${weekStart}` : '';
    const res = await fetch(`${BASE}/schedule/view/${token}${qs}`);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Dashboard ──
export const getDashboardStats = () => request('/dashboard/stats');

// ── Auth Check ──
export const getAuthCheck = (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/shifts/auth-check?${qs}`);
};

// ── Schedule Notifications ──
export const sendScheduleNotifications = (data) => request('/schedule-notifications/send', { method: 'POST', body: JSON.stringify(data) });
export const getNotificationStatus = (weekStart) => request(`/schedule-notifications/status?weekStart=${weekStart}`);

export const getScheduleConfirm = (token) =>
    fetch(`${BASE}/schedule/confirm/${token}`).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    });

export const confirmSchedule = (token) =>
    fetch(`${BASE}/schedule/confirm/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    });

export const uploadPayrollRun = (formData) =>
    fetch(`${BASE}/payroll/runs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
    }).then(async (res) => {
        if (res.status === 401) {
            clearToken();
            window.dispatchEvent(new Event('auth:logout'));
            throw new Error('Session expired. Please log in again.');
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    });
