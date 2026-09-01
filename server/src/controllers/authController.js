const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('../services/notificationService');
const audit = require('../services/auditService');
const { JWT_SECRET } = require('../config/secrets');
const { runWithTenant } = require('../lib/tenantContext');

const TOKEN_EXPIRY = '24h';

// `surface` records which app the token was issued for: 'admin' (the office/admin
// web app, via /auth/login) or 'employee' (the PCA portal, via /auth/employee-login).
// Route middleware enforces the boundary so an employee-portal token can't be used
// against admin APIs and vice-versa. Defaults to 'admin' so any pre-existing token
// minted before this claim keeps working in the admin app.
function signToken(user, permissions, surface = 'admin') {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            surface,
            permissionGroupId: user.permissionGroupId ?? null,
            permissions: Array.isArray(permissions) ? permissions : [],
            permissionsVersion: user.permissionsVersion ?? 1,
            agencyId: user.agencyId ?? null,
            agencySlug: user._agencySlug ?? null,
        },
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
        const agencyId = req.agency ? req.agency.id : null;
        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase().trim(), agencyId },
        });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        if (!req.agency) {
            // Superadmin accounts only authenticate on the platform host
            // (admin.<BASE_DOMAIN> in production; loopback/apex also count
            // in dev/test — see resolveAgency). Any other non-agency host
            // (e.g. production apex) rejects even valid superadmin creds —
            // same "invalid email or password" response, no oracle.
            if (user.role !== 'superadmin' || !req.isPlatformHost) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
        }
        if (user.archivedAt) {
            return res.status(403).json({ error: 'This account has been archived. Please contact your administrator.' });
        }
        if (!user.active) {
            return res.status(403).json({ error: 'This account has been deactivated. Please contact your administrator.' });
        }
        // Caregivers belong in the Employee Portal, never the admin app. Check this
        // BEFORE the pending-status gate so an employee always gets the clear
        // "use the Employee Portal" message rather than a misleading "pending approval"
        // one. (Belt-and-suspenders — the token's `surface` claim, enforced by route
        // middleware, is the primary boundary.)
        if (user.role === 'pca') {
            return res.status(403).json({ error: 'Please use the Employee Portal to log in.' });
        }
        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is pending admin approval. You will receive an email when activated.' });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const group = user.permissionGroupId
            ? await prisma.permissionGroup.findUnique({ where: { id: user.permissionGroupId } })
            : null;
        const permissions = group && Array.isArray(group.permissions) ? group.permissions : [];
        user._agencySlug = req.agency ? req.agency.slug : null;
        const token = signToken(user, permissions, 'admin');
        // login fires before tenantMiddleware establishes context; wrap the
        // fire-and-forget audit call so getAgencyId() stamps it correctly.
        runWithTenant({ agencyId: user.agencyId ?? null, db: null }, () => {
            audit.logAction({ userId: user.id, userName: user.name, userRole: user.role, action: 'LOGIN', entityType: 'User', entityId: user.id, entityName: user.name });
        });
        res.json({
            token,
            user: {
                id: user.id, email: user.email, name: user.name, role: user.role,
                permissionGroupId: user.permissionGroupId ?? null,
                permissions,
                permissionsVersion: user.permissionsVersion ?? 1,
            },
        });
    } catch (err) { next(err); }
}

// GET /api/auth/me
async function getMe(req, res, next) {
    try {
        const user = await req.db.user.findUnique({
            where: { id: req.user.id },
            include: { permissionGroup: true },
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const permissions = user.permissionGroup && Array.isArray(user.permissionGroup.permissions)
            ? user.permissionGroup.permissions
            : [];
        const employee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { onboardingStatus: true } });
        res.json({
            id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone,
            permissionGroupId: user.permissionGroupId ?? null,
            permissions,
            permissionsVersion: user.permissionsVersion ?? 1,
            onboardingStatus: employee ? employee.onboardingStatus : null,
        });
    } catch (err) { next(err); }
}

// POST /api/auth/register  (admin only)
async function register(req, res, next) {
    try {
        const { email, password, name, role, phone, permissionGroupId } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        const validRole = ['admin', 'user', 'pca'].includes(role) ? role : 'pca';
        const existing = await req.db.user.findFirst({
            where: { email: email.toLowerCase().trim(), agencyId: req.user.agencyId ?? null },
        });
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' });
        }
        if (validRole === 'user' && Number.isInteger(permissionGroupId)) {
            const group = await req.db.permissionGroup.findUnique({ where: { id: permissionGroupId } });
            if (!group || group.archivedAt) {
                return res.status(400).json({ error: 'Invalid permission group' });
            }
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await req.db.user.create({
            data: {
                email: email.toLowerCase().trim(),
                passwordHash,
                name: name.trim(),
                role: validRole,
                phone: (phone || '').trim(),
                permissionGroupId: (validRole === 'user' && Number.isInteger(permissionGroupId)) ? permissionGroupId : null,
                agencyId: req.user.agencyId,
            },
        });
        res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'User', entityId: user.id, entityName: user.name });

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
                        <tr><td style="color:#71717a">Role</td><td>${user.role}</td></tr>
                    </table>
                    <p style="margin-top:16px">To set your password, use the <strong>Forgot Password</strong> link on the login page, or ask your administrator for the password you were assigned.</p>
                    <p style="margin-top:20px">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">Log In</a>
                    </p>
                </div>`,
                `Welcome to NV Best PCA\n\nEmail: ${user.email}\nRole: ${user.role}\n\nTo set your password, use the "Forgot Password" link on the login page, or ask your administrator for the password you were assigned.\n\nLog in at: ${loginUrl}`
            ).catch(err => console.error('Welcome email failed:', err.message));
        }
    } catch (err) { next(err); }
}

// GET /api/auth/users  (admin only)
async function listUsers(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const users = await req.db.user.findMany({
            where,
            select: {
                id: true, email: true, name: true, role: true, phone: true, active: true,
                createdAt: true, archivedAt: true, permissionGroupId: true,
                permissionGroup: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users.map(u => ({
            id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone,
            active: u.active, createdAt: u.createdAt, archivedAt: u.archivedAt,
            permissionGroupId: u.permissionGroupId,
            permissionGroupName: u.permissionGroup?.name ?? null,
        })));
    } catch (err) { next(err); }
}

// DELETE /api/auth/users/:id  (admin only — soft-delete)
async function deleteUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        const user = await req.db.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const archived = await req.db.user.update({ where: { id }, data: { archivedAt: new Date() } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'User', entityId: id, entityName: user.name });
        res.json({ id: archived.id, email: archived.email, name: archived.name, role: archived.role });
    } catch (err) { next(err); }
}

// PUT /api/auth/users/:id/restore  (admin only)
async function restoreUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        const user = await req.db.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const restored = await req.db.user.update({ where: { id }, data: { archivedAt: null } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'User', entityId: id, entityName: restored.name });
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
        const user = await req.db.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const passwordHash = await bcrypt.hash(password, 10);
        // Bump permissionsVersion so all of the user's existing tokens are
        // rejected on their next request, forcing a re-login with the new password.
        await req.db.user.update({ where: { id }, data: { passwordHash, permissionsVersion: { increment: 1 } } });

        // Send password reset email (fire-and-forget)
        if (isEmailConfigured()) {
            const loginUrl = `${req.protocol}://${req.get('host')}`;
            sendEmail(
                user.email,
                'Your Password Has Been Reset — CareOmni',
                `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto">
                    <h2 style="color:#09090b">Password Reset</h2>
                    <p>Hi ${user.name},</p>
                    <p>Your password has been reset by an administrator.</p>
                    <table cellpadding="8" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;width:100%">
                        <tr><td style="color:#71717a">Email</td><td><strong>${user.email}</strong></td></tr>
                    </table>
                    <p style="margin-top:16px">Your administrator will share your new password with you directly. If you did not expect this change, use the <strong>Forgot Password</strong> link to set your own password.</p>
                    <p style="margin-top:20px">
                        <a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Log In</a>
                    </p>
                </div>`,
                `Your password has been reset by an administrator.\n\nEmail: ${user.email}\n\nYour administrator will share your new password with you directly. If you did not expect this change, use the "Forgot Password" link to set your own password.\n\nLog in at: ${loginUrl}`
            ).catch(err => console.error('Password reset email failed:', err.message));
        }

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESET_PASSWORD', entityType: 'User', entityId: id, entityName: user.name });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function permanentlyDeleteUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
        const user = await req.db.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.archivedAt) return res.status(400).json({ error: 'Only archived users can be permanently deleted' });
        await req.db.user.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PERMANENT_DELETE', entityType: 'User', entityId: id, entityName: user.name });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function bulkPermanentlyDeleteUsers(req, res, next) {
    try {
        const result = await req.db.user.deleteMany({ where: { archivedAt: { not: null } } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'BULK_DELETE', entityType: 'User', entityId: 0, entityName: '', metadata: { count: result.count } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

// PUT /api/auth/users/:id/toggle-active (admin only)
async function toggleUserActive(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }
        const user = await req.db.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const updated = await req.db.user.update({
            where: { id },
            data: { active: !user.active },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'TOGGLE_ACTIVE', entityType: 'User', entityId: id, entityName: updated.name, changes: audit.diffFields(user, updated, ['active']) });
        res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, active: updated.active });
    } catch (err) { next(err); }
}

// POST /api/auth/forgot-password (public)
async function forgotPassword(req, res, next) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase().trim(), agencyId: req.agency?.id ?? null },
        });
        // Always return success to avoid revealing whether email exists
        if (!user || user.archivedAt) {
            return res.json({ success: true });
        }

        // Invalidate any existing unused tokens for this user
        await prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        });

        // Create reset token (expires in 1 hour)
        const resetToken = await prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                agencyId: user.agencyId ?? null,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
        });

        // Send reset email
        if (isEmailConfigured()) {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;
            sendEmail(
                user.email,
                'Reset Your Password — CareOmni',
                `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto">
                    <h2 style="color:#09090b">Password Reset Request</h2>
                    <p>Hi ${user.name},</p>
                    <p>We received a request to reset your password. Click the button below to set a new password:</p>
                    <p style="margin:24px 0">
                        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Reset Password</a>
                    </p>
                    <p style="font-size:13px;color:#71717a">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
                </div>`,
                `Password Reset Request\n\nHi ${user.name},\n\nReset your password using this link:\n${resetUrl}\n\nThis link expires in 1 hour.`
            ).catch(err => console.error('Password reset email failed:', err.message));
        }

        res.json({ success: true });
    } catch (err) { next(err); }
}

// POST /api/auth/reset-password-with-token (public)
async function resetPasswordWithToken(req, res, next) {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }
        if (password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
        if (!resetToken) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }
        if (req.agency && resetToken.agencyId !== req.agency.id) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }
        // Apex/loopback requests have no resolved agency. An agency user's
        // token (agencyId set) must not be usable there — only a
        // superadmin's token (agencyId null) is allowed to redeem on the apex.
        if (!req.agency && resetToken.agencyId !== null) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }
        if (resetToken.usedAt) {
            return res.status(400).json({ error: 'This reset link has already been used' });
        }
        if (new Date() > resetToken.expiresAt) {
            return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        // Bump permissionsVersion so all of the user's existing tokens are
        // rejected on their next request, forcing a re-login with the new password.
        await prisma.$transaction([
            prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash, permissionsVersion: { increment: 1 } } }),
            prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
        ]);

        res.json({ success: true });
    } catch (err) { next(err); }
}

async function employeeLogin(req, res, next) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase().trim(), agencyId: req.agency?.id ?? null },
        });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        if (user.archivedAt) {
            return res.status(403).json({ error: 'This account has been archived. Please contact your administrator.' });
        }
        if (!user.active) {
            return res.status(403).json({ error: 'This account has been deactivated. Please contact your administrator.' });
        }
        // Fetch the linked employee up front so the pending-status gate below can be
        // relaxed for employees who are actively onboarding. The portal keeps them on
        // the onboarding-only screen via employee.onboardingStatus + the App gate; a
        // pending user.status must NOT lock them out of the very portal they need to
        // reach to fix things and re-submit.
        const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
        if (!employee) {
            return res.status(403).json({ error: 'This account is not an employee account. Please use the admin app to log in.' });
        }
        const ONBOARDING_LOGIN_STATUSES = ['pending_review', 'changes_requested'];
        if (user.status === 'pending' && !ONBOARDING_LOGIN_STATUSES.includes(employee.onboardingStatus)) {
            return res.status(403).json({ error: 'Your account is pending admin approval. You will receive an email when activated.' });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const group = user.permissionGroupId
            ? await prisma.permissionGroup.findUnique({ where: { id: user.permissionGroupId } })
            : null;
        const permissions = group && Array.isArray(group.permissions) ? group.permissions : [];
        user._agencySlug = req.agency ? req.agency.slug : null;
        const token = signToken(user, permissions, 'employee');
        // employeeLogin fires before tenantMiddleware establishes context; wrap
        // the fire-and-forget audit call so getAgencyId() stamps it correctly.
        runWithTenant({ agencyId: user.agencyId ?? null, db: null }, () => {
            audit.logAction({ userId: user.id, userName: user.name, userRole: user.role, action: 'LOGIN', entityType: 'User', entityId: user.id, entityName: user.name, metadata: { portal: 'employee' } });
        });
        res.json({
            token,
            user: {
                id: user.id, email: user.email, name: user.name, role: user.role,
                permissionGroupId: user.permissionGroupId ?? null,
                permissions,
                permissionsVersion: user.permissionsVersion ?? 1,
                onboardingStatus: employee.onboardingStatus,
            },
        });
    } catch (err) { next(err); }
}

// PUT /api/auth/users/:id  (admin only — edit user fields, optional password/reactivate)
async function updateUser(req, res, next) {
    try {
        const id = Number(req.params.id);
        const user = await req.db.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { name, email, role, phone, permissionGroupId, password, active } = req.body;
        const isSelf = id === req.user.id;

        // Self-guard: an admin cannot demote or deactivate their own account here.
        if (isSelf && role !== undefined && role !== user.role) {
            return res.status(400).json({ error: 'You cannot change your own role' });
        }
        if (isSelf && active !== undefined && active !== user.active) {
            return res.status(400).json({ error: 'You cannot change your own active status' });
        }

        const data = {};

        if (name !== undefined) {
            if (!String(name).trim()) return res.status(400).json({ error: 'Name is required' });
            data.name = String(name).trim();
        }

        if (email !== undefined) {
            const normalized = String(email).toLowerCase().trim();
            if (!normalized) return res.status(400).json({ error: 'Email is required' });
            // email alone is not a unique key under multi-tenancy (unique is
            // agencyId_email); req.db is already agency-scoped, so findFirst by
            // email checks uniqueness within this agency only.
            const existing = await req.db.user.findFirst({ where: { email: normalized } });
            if (existing && existing.id !== id) {
                return res.status(409).json({ error: 'A user with this email already exists' });
            }
            data.email = normalized;
        }

        let validRole = user.role;
        if (role !== undefined) {
            validRole = ['admin', 'user', 'pca'].includes(role) ? role : user.role;
            data.role = validRole;
        }

        // Permission group only applies to the 'user' role; validate when provided, clear otherwise.
        if (validRole !== 'user') {
            data.permissionGroupId = null;
        } else if (permissionGroupId !== undefined) {
            if (Number.isInteger(permissionGroupId)) {
                const group = await req.db.permissionGroup.findUnique({ where: { id: permissionGroupId } });
                if (!group || group.archivedAt) return res.status(400).json({ error: 'Invalid permission group' });
                data.permissionGroupId = permissionGroupId;
            } else {
                data.permissionGroupId = null;
            }
        }

        if (phone !== undefined) data.phone = String(phone || '').trim();
        if (active !== undefined) data.active = !!active;

        let passwordChanged = false;
        if (password !== undefined && password !== '') {
            if (String(password).length < 4) {
                return res.status(400).json({ error: 'Password must be at least 4 characters' });
            }
            data.passwordHash = await bcrypt.hash(String(password), 10);
            passwordChanged = true;
        }

        // Bump permissionsVersion on any security-affecting change so existing tokens are rejected.
        const roleChanged = data.role !== undefined && data.role !== user.role;
        const groupChanged = data.permissionGroupId !== undefined && data.permissionGroupId !== user.permissionGroupId;
        if (passwordChanged || roleChanged || groupChanged) {
            data.permissionsVersion = { increment: 1 };
        }

        const updated = await req.db.user.update({ where: { id }, data });

        res.json({
            id: updated.id, email: updated.email, name: updated.name,
            role: updated.role, phone: updated.phone, active: updated.active,
            permissionGroupId: updated.permissionGroupId,
        });

        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'UPDATE', entityType: 'User', entityId: id, entityName: updated.name,
            changes: audit.diffFields(user, updated, ['name', 'email', 'role', 'phone', 'permissionGroupId', 'active']),
            metadata: passwordChanged ? { passwordChanged: true } : undefined,
        });
    } catch (err) { next(err); }
}

module.exports = { login, employeeLogin, getMe, register, listUsers, deleteUser, restoreUser, resetPassword, permanentlyDeleteUser, bulkPermanentlyDeleteUsers, forgotPassword, resetPasswordWithToken, toggleUserActive, updateUser };
