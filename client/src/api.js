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

async function handleRes(res) {
    if (res.status === 401) {
        clearToken();
        window.dispatchEvent(new Event('auth:logout'));
        throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
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
export const forgotPassword = (email) =>
    fetch(`${BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Request failed');
        }
        return res.json();
    });
export const resetPasswordWithToken = (token, password) =>
    fetch(`${BASE}/auth/reset-password-with-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Request failed');
        }
        return res.json();
    });
export const registerUser = (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const getUsers = ({ archived } = {}) => request(`/auth/users${archived ? '?archived=true' : ''}`);
export const deleteUser = (id) =>
    request(`/auth/users/${id}`, { method: 'DELETE' });
export const restoreUser = (id) =>
    request(`/auth/users/${id}/restore`, { method: 'PUT' });
export const permanentlyDeleteUser = (id) =>
    request(`/auth/users/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeleteUsers = () =>
    request('/auth/users/bulk-permanent', { method: 'DELETE' });
export const resetUserPassword = (id, password) =>
    request(`/auth/users/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ password }) });
export const toggleUserActive = (id) =>
    request(`/auth/users/${id}/toggle-active`, { method: 'PUT' });

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
export const permanentlyDeleteClient = (id) =>
    request(`/clients/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeleteClients = (clientIds) =>
    request('/clients/bulk-permanent', { method: 'DELETE', body: JSON.stringify({ clientIds }) });
export const listArchivedClients = () => request('/clients/archived');
export const bulkRestoreClients = (clientIds) => request('/clients/restore', { method: 'POST', body: JSON.stringify({ clientIds }) });
export const mergeClients = (keepId, mergeId) =>
    request(`/clients/${keepId}/merge`, { method: 'POST', body: JSON.stringify({ mergeId }) });

// Bulk Import
export const bulkImport = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE}/clients/bulk-import`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(handleRes);
};

// Bulk Delete
export const bulkDeleteClients = (ids) =>
    request('/clients/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Authorizations
export const createAuthorization = (clientId, data) =>
    request(`/clients/${clientId}/authorizations`, { method: 'POST', body: JSON.stringify(data) });
export const updateAuthorization = (id, data) =>
    request(`/authorizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const archiveAuthorization = (id) =>
    request(`/authorizations/${id}/archive`, { method: 'PUT' });
export const restoreAuthorization = (id) =>
    request(`/authorizations/${id}/restore`, { method: 'PUT' });
export const deleteAuthorization = (id) =>
    request(`/authorizations/${id}`, { method: 'DELETE' });
export const updateAuthAccountNumber = (id, accountNumber) =>
    request(`/authorizations/${id}/account-number`, { method: 'PATCH', body: JSON.stringify({ accountNumber }) });
export const updateAuthSandataClientId = (id, sandataClientId) =>
    request(`/authorizations/${id}/sandata-client-id`, { method: 'PATCH', body: JSON.stringify({ sandataClientId }) });
export const updateAuthManualStatus = (id, manualStatus) =>
    request(`/authorizations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ manualStatus }) });
export const renewAuthorization = (oldAuthId, data) =>
    request(`/authorizations/${oldAuthId}/renew`, { method: 'POST', body: JSON.stringify(data) });

// Care Team
export const addCareTeamMember = (clientId, data) =>
    request(`/clients/${clientId}/care-team`, { method: 'POST', body: JSON.stringify(data) });
export const removeCareTeamMember = (clientId, id) =>
    request(`/clients/${clientId}/care-team/${id}`, { method: 'DELETE' });

// Client Documents
export const uploadDocument = (clientId, formData) => {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${BASE}/clients/${clientId}/documents`, {
        method: 'POST',
        headers,
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
};
export const downloadDocument = (id) => {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${BASE}/documents/${id}/download`, { headers })
        .then(async res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
            const arrayBuffer = await res.arrayBuffer();
            return new Blob([arrayBuffer], { type: contentType });
        });
};
export const deleteDocument = (id) =>
    request(`/documents/${id}`, { method: 'DELETE' });

// Authorization Documents
export const uploadAuthDocument = (authId, formData) => {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${BASE}/authorizations/${authId}/documents`, {
        method: 'POST',
        headers,
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
};
export const downloadAuthDocument = (id) => {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${BASE}/auth-documents/${id}/download`, { headers })
        .then(async res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
            const arrayBuffer = await res.arrayBuffer();
            return new Blob([arrayBuffer], { type: contentType });
        });
};
export const deleteAuthDocument = (id) =>
    request(`/auth-documents/${id}`, { method: 'DELETE' });

// Hospital Visits
export const getHospitalVisits = (clientId) =>
    request(`/clients/${clientId}/hospital-visits`);
export const createHospitalVisit = (clientId, data) =>
    request(`/clients/${clientId}/hospital-visits`, { method: 'POST', body: JSON.stringify(data) });
export const updateHospitalVisit = (id, data) =>
    request(`/hospital-visits/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteHospitalVisit = (id) =>
    request(`/hospital-visits/${id}`, { method: 'DELETE' });

// Incidents
export const getIncidents = (clientId) =>
    request(`/clients/${clientId}/incidents`);
export const createIncident = (clientId, data) =>
    request(`/clients/${clientId}/incidents`, { method: 'POST', body: JSON.stringify(data) });
export const updateIncident = (id, data) =>
    request(`/incidents/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteIncident = (id) =>
    request(`/incidents/${id}`, { method: 'DELETE' });

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
export const permanentlyDeleteInsuranceType = (id) =>
    request(`/insurance-types/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeleteInsuranceTypes = () =>
    request('/insurance-types/bulk-permanent', { method: 'DELETE' });

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
export const permanentlyDeleteService = (id) =>
    request(`/services/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeleteServices = () =>
    request('/services/bulk-permanent', { method: 'DELETE' });

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
export const permanentlyDeleteTimesheet = (id) =>
    request(`/timesheets/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeleteTimesheets = () =>
    request('/timesheets/bulk-permanent', { method: 'DELETE' });
export const restoreTimesheet = (id) =>
    request(`/timesheets/${id}/restore`, { method: 'PUT' });

// Timesheet Status (admin revert)
export const updateTimesheetStatus = (id, status, correctionNote) =>
    request(`/timesheets/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, correctionNote }) });

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

export const exportBulkTimesheetPdf = (ids) =>
    fetch(`${BASE}/timesheets/bulk-export-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    });

// ── Payroll ──
export const getPayrollRuns   = ({ archived } = {})    => request(`/payroll/runs${archived ? '?archived=true' : ''}`);
export const getPayrollRun    = (id)  => request(`/payroll/runs/${id}`);
export const updatePayrollRun = (id, data) => request(`/payroll/runs/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deletePayrollRun   = (id)  => request(`/payroll/runs/${id}`, { method: 'DELETE' });
export const restorePayrollRun  = (id)  => request(`/payroll/runs/${id}/restore`, { method: 'PUT' });
export const permanentlyDeletePayrollRun = (id) => request(`/payroll/runs/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeletePayrollRuns = () => request('/payroll/runs/bulk-permanent', { method: 'DELETE' });
export const updatePayrollVisit = (id, data) =>
    request(`/payroll/visits/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const updatePayrollVisitNotes = (id, notes) =>
    request(`/payroll/visits/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) });

// ── Scheduling ──
export const getShifts = (weekStart, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.startDate && filters.endDate) {
        params.set('startDate', filters.startDate);
        params.set('endDate', filters.endDate);
    } else if (weekStart) {
        params.set('weekStart', weekStart);
    }
    if (filters.clientId) params.set('clientId', filters.clientId);
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    return request(`/shifts?${params.toString()}`);
};
export const createShift = (data) =>
    request('/shifts', { method: 'POST', body: JSON.stringify(data) });
export const updateShift = (id, data) =>
    request(`/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const bulkUpdateShifts = (shiftIds, updates) =>
    request('/shifts/bulk', { method: 'PATCH', body: JSON.stringify({ shiftIds, updates }) });
export const bulkUpdateShiftsPerShift = (perShiftUpdates, applyToFuture) =>
    request('/shifts/bulk-per-shift', { method: 'PATCH', body: JSON.stringify({ perShiftUpdates, applyToFuture }) });
export const bulkDeleteShifts = (shiftIds) =>
    request('/shifts/bulk', { method: 'DELETE', body: JSON.stringify({ shiftIds }) });
export const bulkUndoShifts = (batchId) =>
    request(`/shifts/bulk-undo/${batchId}`, { method: 'POST' });
export const listBulkEditBatches = () =>
    request('/shifts/bulk-edit-batches');
export const repeatShift = (id, data) =>
    request(`/shifts/${id}/repeat`, { method: 'POST', body: JSON.stringify(data) });
export const deleteShift = (id, { group } = {}) =>
    request(`/shifts/${id}${group ? '?group=true' : ''}`, { method: 'DELETE' });
export const restoreShift = (id) =>
    request(`/shifts/${id}/restore`, { method: 'PUT' });
export const restoreShifts = (shiftIds) =>
    request('/shifts/restore', { method: 'POST', body: JSON.stringify({ shiftIds }) });
export const permanentDeleteShifts = (shiftIds) =>
    request('/shifts/permanent', { method: 'DELETE', body: JSON.stringify({ shiftIds }) });
export const listArchivedShifts = () =>
    request('/shifts/archived');
export const deleteAllShifts = () =>
    request('/shifts/all', { method: 'DELETE' });
export const getClientSchedule = (clientId, weekStart) =>
    request(`/shifts/client/${clientId}${weekStart ? '?weekStart=' + weekStart : ''}`);
export const getEmployeeSchedule = (employeeId, weekStart, { all } = {}) =>
    request(`/shifts/employee/${employeeId}${all ? '?all=true' : weekStart ? '?weekStart=' + weekStart : ''}`);
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
export const permanentlyDeleteEmployee = (id) => request(`/employees/${id}/permanent`, { method: 'DELETE' });
export const bulkPermanentlyDeleteEmployees = (employeeIds) => request('/employees/bulk-permanent', { method: 'DELETE', body: JSON.stringify({ employeeIds }) });
export const listArchivedEmployees = () => request('/employees/archived');
export const bulkRestoreEmployees = (employeeIds) => request('/employees/restore', { method: 'POST', body: JSON.stringify({ employeeIds }) });
export const bulkImportEmployees = (formData) =>
    fetch(`${BASE}/employees/bulk-import`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData }).then(handleRes);

// Employee Certifications
export const getEmployeeCertifications = (employeeId) => request(`/employees/${employeeId}/certifications`);
export const createEmployeeCertification = (employeeId, formData) =>
    fetch(`${BASE}/employees/${employeeId}/certifications`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData }).then(handleRes);
export const updateEmployeeCertification = (id, formData) =>
    fetch(`${BASE}/certifications/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` }, body: formData }).then(handleRes);
export const deleteEmployeeCertification = (id) => request(`/certifications/${id}`, { method: 'DELETE' });
export const downloadEmployeeCertification = (id) =>
    fetch(`${BASE}/certifications/${id}/download`, { headers: { Authorization: `Bearer ${getToken()}` } });

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

export function recordScheduleOpen(token, weekStart) {
    const qs = weekStart ? `?weekStart=${weekStart}` : '';
    fetch(`${BASE}/schedule/view/${token}/open${qs}`, { method: 'POST' }).catch(() => {});
}

export async function getScheduleNotification(token, weekStart) {
    const qs = weekStart ? `?weekStart=${weekStart}` : '';
    const res = await fetch(`${BASE}/schedule/view/${token}/notification${qs}`);
    if (!res.ok) return null;
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
export const getEmployeeNotificationHistory = (employeeId) =>
    request(`/schedule-notifications/employee/${employeeId}`);

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

export const respondToSchedule = (token, response, notes) =>
    fetch(`${BASE}/schedule/respond/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, notes }),
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    });

export const getScheduleResponses = (weekStart) =>
    request(`/schedule-notifications/responses?weekStart=${weekStart}`);

// ── Audit Logs ──
export const getAuditLogs = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/audit-logs${qs ? '?' + qs : ''}`);
};
export const getEntityAuditLogs = (entityType, entityId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/audit-logs/${entityType}/${entityId}${qs ? '?' + qs : ''}`);
};

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

// ── Client Activities ──
export const getClientActivities = (clientId, page = 1) =>
    request(`/clients/${clientId}/activities?page=${page}`);

export const createClientActivity = (clientId, data) =>
    request(`/clients/${clientId}/activities`, { method: 'POST', body: JSON.stringify(data) });

export const deleteClientActivity = (id) =>
    request(`/activities/${id}`, { method: 'DELETE' });

// ── Tasks ──
export const listTasks = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/tasks${qs ? '?' + qs : ''}`);
};

export const getTask = (id) => request(`/tasks/${id}`);

export const getTaskSummary = () => request('/tasks/summary');

export const createTask = (data) =>
    request('/tasks', { method: 'POST', body: JSON.stringify(data) });

export const updateTask = (id, data) =>
    request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const deleteTask = (id) =>
    request(`/tasks/${id}`, { method: 'DELETE' });

export const bulkUpdateTasks = (ids, status) =>
    request('/tasks/bulk-update', { method: 'PATCH', body: JSON.stringify({ ids, status }) });

// ── Workflow Triggers ──
export const listWorkflowTriggers = () => request('/workflow-triggers');

export const updateWorkflowTrigger = (id, data) =>
    request(`/workflow-triggers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Receipts ──
export const getReceipts = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/receipts${qs ? '?' + qs : ''}`);
};
export const previewReceipts = (data) => request('/receipts/preview', { method: 'POST', body: JSON.stringify(data) });
export const generateReceipts = (data) => request('/receipts/generate', { method: 'POST', body: JSON.stringify(data) });
export const updateReceipt = (id, data) => request(`/receipts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const finalizeReceipts = (ids) => request('/receipts/finalize', { method: 'POST', body: JSON.stringify({ ids }) });
export const sendReceipts = (ids) => request('/receipts/send', { method: 'POST', body: JSON.stringify({ ids }) });
export const downloadReceiptPdf = (id) =>
    fetch(`${BASE}/receipts/${id}/pdf`, {
        headers: { Authorization: `Bearer ${authToken}` },
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    });

// ── Payroll Profile ──
export const getPayrollProfile = (employeeId) => request(`/employees/${employeeId}/payroll-profile`);
export const upsertPayrollProfile = (employeeId, data) => request(`/employees/${employeeId}/payroll-profile`, { method: 'PUT', body: JSON.stringify(data) });
export const revealPayrollField = (employeeId, field) => request(`/employees/${employeeId}/payroll-profile/reveal?field=${field}`);

// ── SANDATA Import ──
export const previewSandata = (file, accountNumber) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('accountNumber', accountNumber);
    return fetch(`${BASE}/sandata/preview`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(handleRes);
};
export const applySandata = (accountNumber, entries) =>
    request('/sandata/apply', { method: 'POST', body: JSON.stringify({ accountNumber, entries }) });
export const undoSandata = (previousValues) =>
    request('/sandata/undo', { method: 'POST', body: JSON.stringify({ previousValues }) });

// ── Backup ──
export async function downloadBackup() {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${BASE}/backup/export`, { headers });
    if (res.status === 401) {
        clearToken();
        window.dispatchEvent(new Event('auth:logout'));
        throw new Error('Session expired');
    }
    if (!res.ok) throw new Error(`Backup failed: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nvbestpca-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Admin File Manager ──
export function listFolders(parentId) {
    const q = parentId ? `?parentId=${parentId}` : '';
    return request(`/files/folders${q}`);
}
export function getFolder(id) { return request(`/files/folders/${id}`); }
export function createFolder(name, parentId) {
    return request('/files/folders', { method: 'POST', body: JSON.stringify({ name, parentId }) });
}
export function renameFolder(id, name) {
    return request(`/files/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}
export function moveFolder(id, parentId) {
    return request(`/files/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ parentId }) });
}
export function deleteFolder(id) {
    return request(`/files/folders/${id}`, { method: 'DELETE' });
}
export function restoreFolder(id) {
    return request(`/files/folders/${id}/restore`, { method: 'POST' });
}
export function listArchivedFolders() {
    return request('/files/folders?archived=true');
}
export async function uploadAdminFile(folderId, file) {
    const form = new FormData();
    form.append('folderId', folderId);
    form.append('file', file);
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers, body: form });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
    return res.json();
}
export async function replaceAdminFile(id, blob) {
    const form = new FormData();
    form.append('file', blob);
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${BASE}/files/${id}`, { method: 'PUT', headers, body: form });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
    return res.json();
}
export function downloadAdminFile(id) {
    return `${BASE}/files/${id}/download`;
}
export function renameFile(id, name) {
    return request(`/files/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}
export function moveFile(id, folderId) {
    return request(`/files/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId }) });
}
export function deleteAdminFile(id) {
    return request(`/files/${id}`, { method: 'DELETE' });
}
export function copyFiles(fileIds, targetFolderId) {
    return request('/files/copy', { method: 'POST', body: JSON.stringify({ fileIds, targetFolderId }) });
}
export function searchAdminFiles(q) {
    return request(`/files/search?q=${encodeURIComponent(q)}`);
}

// ── Employee Onboarding ──
export async function resendOnboardingInvite(employeeId) {
    return request(`/employees/${employeeId}/resend-invite`, { method: 'POST' });
}

export async function approveOnboarding(employeeId) {
    return request(`/employees/${employeeId}/approve-onboarding`, { method: 'PATCH' });
}

export async function getEmployeeAvailability(employeeId) {
    return request(`/employees/${employeeId}/availability`);
}

export async function getOnboardingLink(employeeId) {
    return request(`/employees/${employeeId}/onboarding-link`);
}

// ── Conversations ──
export const getConversations = () => request('/conversations');
export const getConversationMessages = (id) => request(`/conversations/${id}/messages`);
export const sendConversationMessage = (id, content) =>
    request(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
export const markConversationRead = (id) =>
    request(`/conversations/${id}/read`, { method: 'POST' });
export const getUnreadSummary = () => request('/conversations/unread-summary');
