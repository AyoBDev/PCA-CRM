const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('../services/notificationService');

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

        // Send welcome email with login credentials (fire-and-forget)
        if (isEmailConfigured()) {
            const loginUrl = `${req.protocol}://${req.get('host')}`;
            sendEmail(
                user.email,
                'Welcome to NV Best PCA — Your Login Details',
                `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
                    <h2>Welcome to NV Best PCA</h2>
                    <p>Hi ${user.name},</p>
                    <p>Your account has been created. Here are your login details:</p>
                    <table cellpadding="8" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;width:100%">
                        <tr><td style="color:#71717a">Email</td><td><strong>${user.email}</strong></td></tr>
                        <tr><td style="color:#71717a">Password</td><td><strong>${password}</strong></td></tr>
                        <tr><td style="color:#71717a">Role</td><td>${user.role}</td></tr>
                    </table>
                    <p style="margin-top:20px">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">Log In</a>
                    </p>
                </div>`,
                `Welcome to NV Best PCA\n\nEmail: ${user.email}\nPassword: ${password}\nRole: ${user.role}\n\nLog in at: ${loginUrl}`
            ).catch(err => console.error('Welcome email failed:', err.message));
        }
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

// PUT /api/auth/users/:id/reset-password  (admin only)
async function resetPassword(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { password } = req.body;
        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.update({ where: { id }, data: { passwordHash } });

        // Send password reset email (fire-and-forget)
        if (isEmailConfigured()) {
            const loginUrl = `${req.protocol}://${req.get('host')}`;
            sendEmail(
                user.email,
                'Your Password Has Been Reset — PCAlink',
                `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto">
                    <h2 style="color:#09090b">Password Reset</h2>
                    <p>Hi ${user.name},</p>
                    <p>Your password has been reset by an administrator. Here are your updated login details:</p>
                    <table cellpadding="8" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;width:100%">
                        <tr><td style="color:#71717a">Email</td><td><strong>${user.email}</strong></td></tr>
                        <tr><td style="color:#71717a">New Password</td><td><strong>${password}</strong></td></tr>
                    </table>
                    <p style="margin-top:20px">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Log In</a>
                    </p>
                </div>`,
                `Your password has been reset.\n\nEmail: ${user.email}\nNew Password: ${password}\n\nLog in at: ${loginUrl}`
            ).catch(err => console.error('Password reset email failed:', err.message));
        }

        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { login, getMe, register, listUsers, deleteUser, restoreUser, resetPassword };
