const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const onboarding = require('../services/onboardingService');

async function getOnboardingInfo(req, res, next) {
    try {
        const { valid, reason, employee } = await onboarding.validateToken(req.params.token);
        if (!valid) {
            const messages = {
                not_found: 'Invalid onboarding link.',
                completed: 'You have already completed onboarding. Check your email for login instructions.',
                expired: 'This link has expired. Contact your admin for a new one.',
            };
            return res.status(400).json({ error: messages[reason] || 'Invalid link' });
        }
        res.json({ employeeName: employee.name, employeeEmail: employee.email });
    } catch (err) { next(err); }
}

async function completeOnboarding(req, res, next) {
    try {
        const { password, passwordConfirm, availability } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }
        if (!availability || !availability.weeklySchedule || !availability.availableFrom) {
            return res.status(400).json({ error: 'Availability information is required' });
        }
        if (!availability.maxHoursPerWeek || !availability.maxConcurrentClients) {
            return res.status(400).json({ error: 'Max hours and max clients are required' });
        }
        if ((!availability.maxTravelTime && !availability.maxTravelDistance) || !availability.transportation) {
            return res.status(400).json({ error: 'Travel information is required' });
        }

        const { employee, skipApproval } = await onboarding.completeOnboarding(req.params.token, { password, availability });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'SUBMIT', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_completed', skipApproval } });
        res.json({ success: true, message: skipApproval ? 'Onboarding complete. You can now log in.' : 'Onboarding complete. Your admin will review and activate your account.' });
    } catch (err) {
        if (err.message === 'not_found' || err.message === 'completed' || err.message === 'expired') {
            return res.status(400).json({ error: 'This onboarding link is no longer valid.' });
        }
        next(err);
    }
}

async function resendInvite(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await prisma.employee.findUnique({ where: { id } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        if (employee.onboardingStatus !== 'invited') {
            return res.status(400).json({ error: 'Can only resend invite for employees with status "invited"' });
        }
        if (!employee.email) {
            return res.status(400).json({ error: 'Employee has no email address' });
        }

        const token = await onboarding.createOnboardingToken(employee.id);
        onboarding.sendOnboardingEmail(employee, token).catch(err => console.error('Resend invite email failed:', err.message));

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'resend_onboarding_invite' } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function approveOnboarding(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await onboarding.approveOnboarding(id);

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'approve_onboarding' } });
        res.json({ success: true });
    } catch (err) {
        if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
        if (err.message === 'Employee is not pending approval') return res.status(400).json({ error: err.message });
        next(err);
    }
}

async function getOnboardingLink(req, res, next) {
    try {
        const id = Number(req.params.id);
        const token = await prisma.onboardingToken.findUnique({ where: { employeeId: id } });
        if (!token || token.status !== 'pending') {
            return res.status(404).json({ error: 'No active onboarding link for this employee' });
        }
        const link = `${onboarding.EMPLOYEE_APP_URL}/onboard/${token.token}`;
        res.json({ link });
    } catch (err) { next(err); }
}

module.exports = { getOnboardingInfo, completeOnboarding, resendInvite, approveOnboarding, getOnboardingLink };
