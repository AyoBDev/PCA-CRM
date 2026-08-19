const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../config/secrets');

async function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const token = header.slice(7);
        const payload = jwt.verify(token, JWT_SECRET);
        const tokenVersion = payload.permissionsVersion ?? 1;
        const dbUser = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { permissionsVersion: true },
        });
        if (!dbUser) return res.status(401).json({ error: 'Invalid or expired token' });
        if ((dbUser.permissionsVersion ?? 1) !== tokenVersion) {
            return res.status(401).json({ error: 'permissions_changed' });
        }
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

// Enforce the token's login surface. A token minted for the employee portal
// (surface: 'employee') must not be usable against admin APIs, and vice-versa.
// Tokens minted before the `surface` claim existed have no surface → treated as
// 'admin' (back-compat), so existing admin sessions keep working; employee tokens
// always carry the claim (issued after this change).
function requireSurface(expected) {
    return (req, res, next) => {
        const surface = (req.user && req.user.surface) || 'admin';
        if (surface !== expected) {
            return res.status(403).json({ error: 'This session is not valid for this application. Please log in again.' });
        }
        next();
    };
}

module.exports = { authenticate, requireRole, requireSurface };
