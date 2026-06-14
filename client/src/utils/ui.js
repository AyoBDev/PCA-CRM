const AVATAR_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6',
    '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#84cc16',
];

export function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name) {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const CLIENT_COLORS = [
    { color: '#3b82f6', bg: '#eff6ff' },
    { color: '#22c55e', bg: '#f0fdf4' },
    { color: '#f59e0b', bg: '#fffbeb' },
    { color: '#ec4899', bg: '#fdf2f8' },
    { color: '#8b5cf6', bg: '#f5f3ff' },
    { color: '#06b6d4', bg: '#ecfeff' },
    { color: '#f97316', bg: '#fff7ed' },
    { color: '#14b8a6', bg: '#f0fdfa' },
    { color: '#6366f1', bg: '#eef2ff' },
    { color: '#84cc16', bg: '#f7fee7' },
];

export function getClientColor(index) {
    return CLIENT_COLORS[index % CLIENT_COLORS.length];
}
