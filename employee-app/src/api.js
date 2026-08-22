import { TOKEN_KEY, USER_KEY } from './authKeys';

const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}/api/employee${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    const base = import.meta.env.BASE_URL || '/';
    window.location.href = `${base}login`;
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Public onboarding endpoints (no auth required)
export function getOnboardingInfo(token) {
    return fetch(`${BASE}/api/onboarding/${token}`)
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error); }); return r.json(); });
}

export function submitOnboarding(token, data) {
    return fetch(`${BASE}/api/onboarding/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error); }); return r.json(); });
}

export function saveOnboardingPersonal(token, data) { return fetch(`${BASE}/api/onboarding/${token}/personal`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()); }
export function saveOnboardingEmergency(token, data) { return fetch(`${BASE}/api/onboarding/${token}/emergency`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()); }
export function saveOnboardingAvailabilityDraft(token, availability) { return fetch(`${BASE}/api/onboarding/${token}/availability-draft`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ availability }) }).then(r => r.json()); }
export function uploadOnboardingDocument(token, reqId, formData) { return fetch(`${BASE}/api/onboarding/${token}/documents/${reqId}`, { method: 'POST', body: formData }).then(r => r.json()); }
export function ackOnboardingPolicy(token, reqId) { return fetch(`${BASE}/api/onboarding/${token}/policies/${reqId}/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()); }
export function submitOnboardingV2(token, data) { return fetch(`${BASE}/api/onboarding/${token}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) }).then(r => r.json()); }

export const api = {
  login: (email, password) =>
    fetch(`${BASE}/api/auth/employee-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async r => { if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'Invalid credentials'); } return r.json(); }),

  // NOTE: /auth/me lives outside the /api/employee prefix (like /auth/employee-login above),
  // so it must use a raw fetch with an explicit Authorization header rather than the
  // request() helper, which always targets /api/employee/*.
  getMe: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE}/api/auth/me`, { headers }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'Request failed'); }
      return r.json();
    });
  },

  getHomeSummary: () => request('/home/summary'),
  getNextShift: () => request('/home/next-shift'),
  getActivity: () => request('/home/activity'),
  getWeekSchedule: (date) => request(`/schedule/week?date=${date}`),
  getScheduleHistory: () => request('/schedule/history'),
  getMyOffers: () => request('/offers'),
  respondToOffer: (id, response) =>
    request(`/offers/${id}/respond`, { method: 'POST', body: JSON.stringify({ response }) }),
  getAvailability: () => request('/availability'),
  submitAvailabilityRequest: (data) => request('/availability/request', { method: 'POST', body: JSON.stringify(data) }),
  getTimeOffRequests: () => request('/time-off'),
  submitTimeOff: (data) => request('/time-off', { method: 'POST', body: JSON.stringify(data) }),
  getCertifications: () => request('/certifications'),
  uploadCertification: (certId, formData) => request(`/certifications/${certId}/upload`, { method: 'POST', body: formData }),
  createCertification: (formData) => request('/certifications', { method: 'POST', body: formData }),
  // Raw fetch (not the JSON-parsing request() helper) — returns a Response so
  // callers can read Content-Type/.blob() themselves, matching the admin app's
  // fetchBlob contract for file preview/download components.
  downloadCertUpload: (uploadId) => fetch(`${BASE}/api/employee/certifications/uploads/${uploadId}/download`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
  }),
  getPayrollSummary: () => request('/payroll/summary'),
  getPaystubs: () => request('/payroll/stubs'),
  getPaystubDownload: (id) => request(`/payroll/stubs/${id}/download`),
  getMessages: (before) => request(`/chat/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (content) => request('/chat/messages', { method: 'POST', body: JSON.stringify({ content }) }),
  markRead: () => request('/chat/read', { method: 'PATCH' }),
  getMessageUnreadCount: () => request('/chat/unread-count'),
  getNotifications: () => request('/notifications'),
  markNotificationsRead: () => request('/notifications/read', { method: 'PATCH' }),
  getTasks: () => request('/tasks'),
  completeTask: (id) => request(`/tasks/${id}/complete`, { method: 'PATCH' }),
  getProfile: () => request('/profile'),
  updateProfile: (data) => request('/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  getRequirements: () => request('/requirements'),
  // For a logged-in onboarding employee: fetch their own onboarding token so the app
  // can send them into the onboarding wizard without needing the email link.
  getMyOnboardingLink: () => request('/onboarding/my-link'),
  uploadRequirementDocument: (reqId, formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE}/api/employee/documents/${reqId}`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'Upload failed'); }
      return r.json();
    });
  },
  ackRequirementPolicy: (reqId) => request(`/policies/${reqId}/ack`, { method: 'POST', body: '{}' }),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: () => request('/push/subscribe', { method: 'DELETE' }),
  getTimesheet: (weekStart) => request(`/timesheet${weekStart ? `?weekStart=${weekStart}` : ''}`),
};
