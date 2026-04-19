const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'nvbestpca-secret';
const TOKEN_EXPIRY = '24h';

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

// POST /api/auth/login
async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = signToken(user);
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    } catch (err) { next(err); }
}

// GET /api/auth/me
async function getMe(req, res, next) {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone });
    } catch (err) { next(err); }
}

// POST /api/auth/register  (admin only)
async function register(req, res, next) {
    try {
        const { email, password, name, role, phone } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        const validRole = ['admin', 'user', 'pca'].includes(role) ? role : 'pca';
        const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase().trim(),
                passwordHash,
                name: name.trim(),
                role: validRole,
                phone: (phone || '').trim(),
            },
        });
        res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone });
    } catch (err) { next(err); }
}

// GET /api/auth/users  (admin only)
async function listUsers(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const users = await prisma.user.findMany({
            where,
            select: { id: true, email: true, name: true, role: true, phone: true, createdAt: true, archivedAt: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    } catch (err) { next(err); }
}

// DELETE /api/auth/users/:id  (admin only — soft-delete)
async function deleteUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const archived = await prisma.user.update({ where: { id }, data: { archivedAt: new Date() } });
        res.json({ id: archived.id, email: archived.email, name: archived.name, role: archived.role });
    } catch (err) { next(err); }
}

// PUT /api/auth/users/:id/restore  (admin only)
async function restoreUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const restored = await prisma.user.update({ where: { id }, data: { archivedAt: null } });
        res.json({ id: restored.id, email: restored.email, name: restored.name, role: restored.role, phone: restored.phone });
    } catch (err) { next(err); }
}

module.exports = { login, getMe, register, listUsers, deleteUser, restoreUser };
