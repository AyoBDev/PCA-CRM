const audit = require('../services/auditService');
const onboarding = require('../services/onboardingService');
const { isOnboardingComplete, projectLedger } = require('../services/requirementService');
// Public-token endpoints (getOnboardingInfo/saveAvailabilityDraft/submitOnboarding)
// run before tenant context exists — same allowlisted pattern as onboardingService.js
// (needs the PHI-decrypting owner client, not the raw basePrisma). Admin-authenticated
// endpoints below use req.db instead.
const prisma = require('../lib/prisma');

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
        if (req.agency && employee.agencyId !== req.agency.id) {
            return res.status(404).json({ error: 'Invalid onboarding link.' });
        }
        const requirements = await projectLedger(prisma, employee.id);
        const draft = employee.onboardingDraft || null;
        res.json({
            employeeName: employee.name,
            employeeEmail: employee.email,
            // If an admin sent them back, show the note explaining what to fix.
            adminReviewNote: employee.adminReviewNote || '',
            onboardingStatus: employee.onboardingStatus,
            // A returning employee already has a login account (set a password on their
            // first submit). The wizard uses this to SKIP the password step on re-entry.
            hasAccount: Boolean(employee.userId),
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

        const { valid, employee: tokenEmployee } = await onboarding.validateToken(req.params.token);
        if (valid && req.agency && tokenEmployee.agencyId !== req.agency.id) {
            return res.status(400).json({ error: 'This onboarding link is no longer valid.' });
        }

        const { employee, skipApproval } = await onboarding.completeOnboarding(req.params.token, { password, availability });
        audit.logAction({ userId: 0, userName: employee.name, userRole: 'pca', action: 'SUBMIT', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_completed', skipApproval } });
        res.json({ success: true, message: skipApproval ? 'Onboarding complete. You can now log in.' : 'Onboarding complete. Your admin will review and activate your account.' });
    } catch (err) {
        if (err.message === 'not_found' || err.message === 'completed' || err.message === 'expired') {
            return res.status(400).json({ error: 'This onboarding link is no longer valid.' });
        }
        if (err.message === 'password_required') {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
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
        // A returning employee (already has a login account — e.g. re-submitting after
        // changes_requested) is NOT asked to set a password again, so don't require one.
        // A first-time submit (no linked account yet) still must set a password.
        if (!employee.userId && !password) return res.status(400).json({ error: 'A password is required to finish onboarding.' });
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
        if (err.message === 'password_required') {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        next(err);
    }
}

async function resendInvite(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await req.db.employee.findUnique({ where: { id } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        if (employee.onboardingStatus !== 'invitation_pending') {
            return res.status(400).json({ error: 'Can only resend invite for employees who have not yet started onboarding' });
        }
        if (!employee.email) {
            return res.status(400).json({ error: 'Employee has no email address' });
        }

        const token = await onboarding.createOnboardingToken(req.db, employee.id);
        onboarding.sendOnboardingEmail(employee, token).catch(err => console.error('Resend invite email failed:', err.message));

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'resend_onboarding_invite' } });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function getOnboardingLink(req, res, next) {
    try {
        const id = Number(req.params.id);
        const token = await req.db.onboardingToken.findUnique({ where: { employeeId: id } });
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
        const employee = await req.db.employee.findUnique({
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
            projectLedger(req.db, id),
            req.db.employeeAvailability.findUnique({ where: { employeeId: id } }),
        ]);
        res.json({ employee, requirements, availability });
    } catch (err) { next(err); }
}

// Employees who have finished onboarding and are awaiting admin approval.
// Admin-only (gated at the route) — this list is not visible to other roles.
async function getOnboardingReviews(req, res, next) {
    try {
        const employees = await req.db.employee.findMany({
            where: { onboardingStatus: 'pending_review' },
            select: { id: true, name: true, email: true, phone: true, updatedAt: true },
            orderBy: { updatedAt: 'asc' }, // oldest submissions first
        });
        // Tally every employee's requirements in ONE grouped query rather than
        // three counts per employee. The per-employee version issued 3N+1
        // queries concurrently — a few hundred pending reviews meant >1,000
        // queries in a single request, saturating the connection pool.
        const ids = employees.map((e) => e.id);
        const grouped = ids.length
            ? await req.db.employeeRequirement.groupBy({
                by: ['employeeId', 'optional', 'status'],
                where: { employeeId: { in: ids } },
                _count: { _all: true },
            })
            : [];

        const tally = new Map(ids.map((id) => [id, { required: 0, satisfied: 0, optionalPending: 0 }]));
        for (const g of grouped) {
            const t = tally.get(g.employeeId);
            if (!t) continue;
            const n = g._count._all;
            if (!g.optional) {
                t.required += n;
                if (g.status === 'submitted' || g.status === 'approved') t.satisfied += n;
            } else if (g.status === 'required') {
                t.optionalPending += n;
            }
        }

        const reviews = employees.map((e) => {
            const { required, satisfied, optionalPending } = tally.get(e.id);
            return { id: e.id, name: e.name, email: e.email, phone: e.phone, submittedAt: e.updatedAt, requiredTotal: required, requiredDone: satisfied, optionalPending };
        });
        res.json({ reviews });
    } catch (err) { next(err); }
}

// Admin per-item decision on a single requirement (approve/reject). Does not move
// the employee's overall onboarding status.
async function reviewRequirementItem(req, res, next) {
    try {
        const id = Number(req.params.id);
        const reqId = Number(req.params.reqId);
        const { decision, reason } = req.body || {};
        if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' });
        const updated = await onboarding.reviewItem(id, reqId, { decision, reason });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'review_requirement', reqId, decision } });
        res.json({ success: true, requirement: updated });
    } catch (err) {
        if (err.message === 'Requirement not found') return res.status(404).json({ error: err.message });
        if (err.message === 'Rejection reason required') return res.status(400).json({ error: err.message });
        next(err);
    }
}

// Admin "finalize review" — reads per-item review decisions and either
// approves+activates the employee (and their login user) or sends them back to
// changes_requested (reopening the onboarding token). See onboardingService.finalizeOnboarding.
async function finalizeOnboarding(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { outcome } = await onboarding.finalizeOnboarding(id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'finalize_onboarding', outcome } });
        res.json({ success: true, outcome });
    } catch (err) {
        if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
        if (err.message === 'Employee is not pending review') return res.status(400).json({ error: err.message });
        next(err);
    }
}

// Explicit whole-submission decisions (the 3 review-modal buttons). Each is
// independent of per-item state and maps to one lifecycle transition.
const REVIEW_DECISION_ERRORS = (err, res, next) => {
    if (err.message === 'Employee not found') return res.status(404).json({ error: err.message });
    if (err.message === 'Employee is not pending review') return res.status(400).json({ error: err.message });
    next(err);
};

async function approveOnboardingSubmission(req, res, next) {
    try {
        const id = Number(req.params.id);
        await onboarding.approveOnboardingSubmission(id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'approve_onboarding' } });
        res.json({ success: true, outcome: 'approved' });
    } catch (err) { REVIEW_DECISION_ERRORS(err, res, next); }
}

async function sendBackOnboarding(req, res, next) {
    try {
        const id = Number(req.params.id);
        const note = (req.body && req.body.note) || '';
        await onboarding.sendBackOnboarding(id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role }, note);
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'send_back_onboarding', note } });
        res.json({ success: true, outcome: 'changes_requested' });
    } catch (err) { REVIEW_DECISION_ERRORS(err, res, next); }
}

async function rejectOnboardingSubmission(req, res, next) {
    try {
        const id = Number(req.params.id);
        const note = (req.body && req.body.note) || '';
        await onboarding.rejectOnboardingSubmission(id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role }, note);
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: id, entityName: '', metadata: { action: 'reject_onboarding', note } });
        res.json({ success: true, outcome: 'inactive' });
    } catch (err) { REVIEW_DECISION_ERRORS(err, res, next); }
}

module.exports = { getOnboardingInfo, saveAvailabilityDraft, completeOnboarding, submitOnboarding, resendInvite, getOnboardingLink, getOnboardingReviews, getOnboardingReviewDetail, reviewRequirementItem, finalizeOnboarding, approveOnboardingSubmission, sendBackOnboarding, rejectOnboardingSubmission };
