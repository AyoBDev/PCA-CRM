const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}/api/employee${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  login: (email, password) =>
    fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => { if (!r.ok) throw new Error('Invalid credentials'); return r.json(); }),

  getHomeSummary: () => request('/home/summary'),
  getNextShift: () => request('/home/next-shift'),
  getActivity: () => request('/home/activity'),
  getWeekSchedule: (date) => request(`/schedule/week?date=${date}`),
  getScheduleHistory: () => request('/schedule/history'),
  getAvailability: () => request('/availability'),
  submitAvailabilityRequest: (data) => request('/availability/request', { method: 'POST', body: JSON.stringify(data) }),
  getTimeOffRequests: () => request('/time-off'),
  submitTimeOff: (data) => request('/time-off', { method: 'POST', body: JSON.stringify(data) }),
  getCertifications: () => request('/certifications'),
  uploadCertification: (certId, formData) => request(`/certifications/${certId}/upload`, { method: 'POST', body: formData }),
  getPayrollSummary: () => request('/payroll/summary'),
  getPaystubs: () => request('/payroll/stubs'),
  getPaystubDownload: (id) => request(`/payroll/stubs/${id}/download`),
  getMessages: (before) => request(`/chat/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (content) => request('/chat/messages', { method: 'POST', body: JSON.stringify({ content }) }),
  markRead: () => request('/chat/read', { method: 'PATCH' }),
  getNotifications: () => request('/notifications'),
  markNotificationsRead: () => request('/notifications/read', { method: 'PATCH' }),
  getTasks: () => request('/tasks'),
  completeTask: (id) => request(`/tasks/${id}/complete`, { method: 'PATCH' }),
  getProfile: () => request('/profile'),
  updateProfile: (data) => request('/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribePush: () => request('/push/subscribe', { method: 'DELETE' }),
};
