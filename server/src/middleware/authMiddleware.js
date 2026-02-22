const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'nvbestpca-secret';

// Verify JWT and attach user to req
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const token = header.slice(7);
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; // { id, email, name, role }
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Require a specific role
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { authenticate, requireRole };
