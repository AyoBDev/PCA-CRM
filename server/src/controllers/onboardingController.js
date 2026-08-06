const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const onboarding = require('../services/onboardingService');
const { isOnboardingComplete, projectLedger } = require('../services/requirementService');

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
        const requirements = await projectLedger(employee.id);
        const draft = employee.onboardingDraft || null;
        res.json({
            employeeName: employee.name,
            employeeEmail: employee.email,
            // If an admin sent them back, show the note explaining what to fix.
            adminReviewNote: employee.adminReviewNote || '',
            requirements,
            // Already-saved values so a returning employee's form is pre-filled on reload.
            // (Password is never returned — it isn't stored until final submit.)
            saved: {
                personal: {
                    address: employee.address || '',
                    dob: employee.dob || '',
                    gender: employee.gender || '',
                    preferredLanguage: employee.preferredLanguage || '',
                },
                emergency: {
                    emergencyContactName: employee.emergencyContactName || '',
                    emergencyContactRelationship: employee.emergencyContactRelationship || '',
                    emergencyContactPhone: employee.emergencyContactPhone || '',
                    emergencyContactEmail: employee.emergencyContactEmail || '',
                },
                // Draft availability (persisted mid-flow so it survives a reload).
                availability: draft && draft.availability ? draft.availability : null,
            },
            progress: {
                personal: Boolean(employee.dob && employee.address),
                emergency: Boolean(employee.emergencyContactName),
                availability: Boolean(draft && draft.availability),
            },
        });
    } catch (err) { next(err); }
}

// Persist the in-progress availability form as a JSON draft so it survives a
// page reload. This is a token-auth public endpoint (userId 0 on the audit).
async function saveAvailabilityDraft(req, res, next) {
    try {
        const { valid, employee } = await onboarding.validateToken(req.params.token);
        if (!valid) return res.status(400).json({ error: 'This onboarding link is no longer valid.' });
        const availability = req.body && req.body.availability ? req.body.availability : null;
        const draft = { ...(employee.onboardingDraft || {}), availability };
        await prisma.employee.update({ where: { id: employee.id }, data: { onboardingDraft: draft } });
        res.json({ success: true });
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

async function submitOnboarding(req, res, next) {
    try {
        const { password, availability } = req.body || {};
        const { valid, employee } = await onboarding.validateToken(req.params.token);
        if (!valid) return res.status(400).json({ error: 'This onboarding link is no longer valid.' });
        // v3 gate: every required document/cert/policy must be satisfied before the account is created.
        const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId: employee.id } });
        if (!isOnboardingComplete(reqs)) return res.status(400).json({ error: 'Please complete all required items before submitting.' });
        if (!password) return res.status(400).json({ error: 'A password is required to finish onboarding.' });
        if (!availability) return res.status(400).json({ error: 'Availability details are required to finish onboarding.' });
        // Reuse the proven account-creation path: hashes the password, creates/links the User,
        // stores availability, and marks the token completed (all transactional).
        const { skipApproval } = await onboarding.completeOnboarding(req.params.token, { password, availability });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'SUBMIT', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_submitted', skipApproval } });
        res.json({ success: true, skipApproval });
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

async function rejectOnboarding(req, res, next) {
    try {
        const id = Number(req.params.id);
        const note = (req.body && req.body.note) || '';
        const employee = await onboarding.reviewOnboarding(id, { status: 'changes_requested', note });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'reject_onboarding', note } });
        res.json({ success: true });
    } catch (err) {
        if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
        if (err.message === 'Employee is not pending approval') return res.status(400).json({ error: err.message });
        next(err);
    }
}

async function requestOnboardingChange(req, res, next) {
    try {
        const id = Number(req.params.id);
        const note = (req.body && req.body.note) || '';
        const employee = await onboarding.reviewOnboarding(id, { status: 'changes_requested', note });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'request_onboarding_change', note } });
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

// Full onboarding detail for ONE employee, for the admin review modal. Admin-only.
async function getOnboardingReviewDetail(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await prisma.employee.findUnique({
            where: { id },
            select: {
                id: true, name: true, email: true, phone: true, address: true, dob: true,
                gender: true, preferredLanguage: true, onboardingStatus: true, adminReviewNote: true,
                emergencyContactName: true, emergencyContactRelationship: true,
                emergencyContactPhone: true, emergencyContactEmail: true,
            },
        });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const [requirements, availability] = await Promise.all([
            projectLedger(id),
            prisma.employeeAvailability.findUnique({ where: { employeeId: id } }),
        ]);
        res.json({ employee, requirements, availability });
    } catch (err) { next(err); }
}

// Employees who have finished onboarding and are awaiting admin approval.
// Admin-only (gated at the route) — this list is not visible to other roles.
async function getOnboardingReviews(req, res, next) {
    try {
        const employees = await prisma.employee.findMany({
            where: { onboardingStatus: 'submitted' },
            select: { id: true, name: true, email: true, phone: true, updatedAt: true },
            orderBy: { updatedAt: 'asc' }, // oldest submissions first
        });
        const reviews = await Promise.all(employees.map(async (e) => {
            const [required, satisfied, optionalPending] = await Promise.all([
                prisma.employeeRequirement.count({ where: { employeeId: e.id, optional: false } }),
                prisma.employeeRequirement.count({ where: { employeeId: e.id, optional: false, status: { in: ['submitted', 'approved'] } } }),
                prisma.employeeRequirement.count({ where: { employeeId: e.id, optional: true, status: 'required' } }),
            ]);
            return { id: e.id, name: e.name, email: e.email, phone: e.phone, submittedAt: e.updatedAt, requiredTotal: required, requiredDone: satisfied, optionalPending };
        }));
        res.json({ reviews });
    } catch (err) { next(err); }
}

module.exports = { getOnboardingInfo, saveAvailabilityDraft, completeOnboarding, submitOnboarding, resendInvite, approveOnboarding, rejectOnboarding, requestOnboardingChange, getOnboardingLink, getOnboardingReviews, getOnboardingReviewDetail };
