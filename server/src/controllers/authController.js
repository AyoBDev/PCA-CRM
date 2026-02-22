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
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (err) { next(err); }
}

// POST /api/auth/register  (admin only)
async function register(req, res, next) {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        const validRole = ['admin', 'pca'].includes(role) ? role : 'pca';
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
            },
        });
        res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (err) { next(err); }
}

// GET /api/auth/users  (admin only)
async function listUsers(req, res, next) {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    } catch (err) { next(err); }
}

// DELETE /api/auth/users/:id  (admin only)
async function deleteUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        await prisma.user.delete({ where: { id } });
        res.status(204).end();
    } catch (err) { next(err); }
}

module.exports = { login, getMe, register, listUsers, deleteUser };
