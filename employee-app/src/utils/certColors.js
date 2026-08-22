// Ported verbatim from client/src/pages/EmployeeDetailPage.jsx (CERT_COLORS,
// lines ~818-827) so the employee app's certification cards render with the
// same "portfolio" look as the admin app. Keep in sync with that file.
export const CERT_COLORS = {
    id_expiration: { accent: '#3b82f6', bg: 'hsl(217 91% 96%)', border: '#3b82f6', label: 'ID EXPIRATION', icon: 'user' },
    tb_test: { accent: '#22c55e', bg: 'hsl(142 76% 96%)', border: '#22c55e', label: 'TB TEST', icon: 'heart' },
    cpr: { accent: '#ef4444', bg: 'hsl(0 84% 96%)', border: '#ef4444', label: 'CPR', icon: 'heart' },
    annual_training: { accent: '#f59e0b', bg: 'hsl(38 100% 96%)', border: '#f59e0b', label: '8HR ANNUAL TRAINING', icon: 'clock' },
    cultural_competency: { accent: '#8b5cf6', bg: 'hsl(270 76% 96%)', border: '#8b5cf6', label: 'CULTURAL COMPETENCY', icon: 'users' },
    infection_control: { accent: '#06b6d4', bg: 'hsl(188 80% 96%)', border: '#06b6d4', label: 'INFECTION CONTROL', icon: 'shieldCheck' },
    background_check: { accent: '#64748b', bg: 'hsl(215 20% 96%)', border: '#64748b', label: 'BACKGROUND CHECK', icon: 'shieldCheck' },
    other: { accent: '#a855f7', bg: 'hsl(270 76% 96%)', border: '#a855f7', label: 'OTHER', icon: 'fileText' },
};
