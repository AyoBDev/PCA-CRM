const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('./notificationService');
const lifecycle = require('./onboardingLifecycle');
const { projectLedger, reviewSummary } = require('./requirementService');

const ONBOARDING_EXPIRY_DAYS = 7;
const EMPLOYEE_APP_URL = process.env.EMPLOYEE_APP_URL || 'http://localhost:4000/employee';

async function createOnboardingToken(db, employeeId) {
    // Owner-connection client does not auto-stamp agencyId — derive it from
    // the employee row so the token lands in the right tenant.
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { agencyId: true } });
    if (!employee) throw new Error('Employee not found');
    await db.onboardingToken.deleteMany({ where: { employeeId } });
    const expiresAt = new Date(Date.now() + ONBOARDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    return db.onboardingToken.create({
        data: { employeeId, expiresAt, agencyId: employee.agencyId },
    });
}

async function sendOnboardingEmail(employee, token) {
    if (!isEmailConfigured()) return;
    const link = `${EMPLOYEE_APP_URL}/onboard/${token.token}`;
    const html = `
        <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;color:#09090b">
            <h2 style="margin:0 0 8px;font-size:20px">Welcome to NV Best PCA</h2>
            <p style="margin:0 0 16px;color:#71717a;font-size:14px">Hi ${employee.name},</p>
            <p style="margin:0 0 16px;font-size:14px">You've been added to our team! To get started, please complete your onboarding by setting up your password and entering your availability.</p>
            <p style="margin:24px 0;text-align:center">
                <a href="${link}" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px">Complete Your Setup</a>
            </p>
            <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center">This link expires in 7 days. Contact your admin if you need a new one.</p>
        </div>
    `;
    const text = `Welcome to NV Best PCA\n\nHi ${employee.name},\n\nComplete your onboarding setup here:\n${link}\n\nThis link expires in 7 days.`;
    await sendEmail(employee.email, 'Welcome to NV Best PCA — Complete Your Setup', html, text);
}

async function sendWelcomeEmail(employee) {
    if (!isEmailConfigured()) return;
    const loginUrl = `${EMPLOYEE_APP_URL}/login`;
    const html = `
        <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;color:#09090b">
            <h2 style="margin:0 0 8px;font-size:20px">You're All Set!</h2>
            <p style="margin:0 0 16px;color:#71717a;font-size:14px">Hi ${employee.name},</p>
            <p style="margin:0 0 16px;font-size:14px">Your account has been activated. You can now log in to view your schedule, submit availability, and communicate with your team.</p>
            <p style="margin:24px 0;text-align:center">
                <a href="${loginUrl}" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px">Log In</a>
            </p>
        </div>
    `;
    const text = `You're All Set!\n\nHi ${employee.name},\n\nYour account is active. Log in at:\n${loginUrl}`;
    await sendEmail(employee.email, "You're All Set — Your Account is Active", html, text);
}

async function validateToken(tokenStr) {
    const token = await prisma.onboardingToken.findUnique({
        where: { token: tokenStr },
        include: { employee: true },
    });
    if (!token) return { valid: false, reason: 'not_found' };
    if (token.status === 'completed') return { valid: false, reason: 'completed' };
    if (new Date() > token.expiresAt) return { valid: false, reason: 'expired' };
    return { valid: true, token, employee: token.employee };
}

async function completeOnboarding(tokenStr, { password, availability }) {
    const { valid, token, employee, reason } = await validateToken(tokenStr);
    if (!valid) throw new Error(reason);

    const email = employee.email.toLowerCase().trim();

    // Runs on public token paths without tenant context (Task 10 wires that).
    // Scope explicitly by the already-loaded employee's agencyId instead.
    const existingUser = await prisma.user.findFirst({ where: { email, agencyId: employee.agencyId } });
    // A returning employee (already has a login account, e.g. re-submitting after
    // changes_requested) keeps their existing password — they were NOT asked for one.
    // Only a brand-new account requires a password to be set here.
    if (!existingUser && (!password || password.length < 8)) {
        throw new Error('password_required');
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    let user;
    // skipApproval means "adopt a pre-existing EXTERNAL account and activate
    // immediately" — it must NOT trigger for the onboarding user this flow
    // itself minted on the first submit. On the first submit we create the user
    // AND link employee.userId to it, so a re-submit after changes_requested has
    // employee.userId === existingUser.id (our own minted user). We only skip
    // approval when the existing user is genuinely external — i.e. it is NOT the
    // employee's already-linked onboarding user. This keeps the re-submit loop
    // going to pending_review instead of auto-activating.
    let skipApproval = false;
    if (existingUser) {
        user = existingUser;
        const isOwnMintedUser = employee.userId === existingUser.id;
        skipApproval = !isOwnMintedUser;
    } else {
        user = await prisma.user.create({
            data: { email, passwordHash, name: employee.name, role: 'pca', status: 'pending', agencyId: employee.agencyId },
        });
    }

    // Availability write is idempotent: on a re-submit the row already exists
    // (@unique employeeId), so a create() would P2002/500 and roll back the whole
    // transaction — upsert keeps the loop working. Same field mapping either way.
    const availabilityData = {
        availableFrom: new Date(availability.availableFrom),
        availableUntil: availability.availableUntil ? new Date(availability.availableUntil) : null,
        weeklySchedule: availability.weeklySchedule,
        maxHoursPerWeek: availability.maxHoursPerWeek,
        maxConcurrentClients: availability.maxConcurrentClients,
        maxTravelDistance: availability.maxTravelTime || availability.maxTravelDistance,
        transportation: availability.transportation,
        holidayAvailability: availability.holidayAvailability,
        blackoutDates: availability.blackoutDates,
        initialTimeOff: availability.initialTimeOff,
        notes: availability.notes || '',
    };

    await prisma.$transaction([
        prisma.employee.update({
            where: { id: employee.id },
            data: { userId: user.id },
        }),
        prisma.onboardingToken.update({
            where: { id: token.id },
            data: { status: 'completed', completedAt: new Date() },
        }),
        prisma.employeeAvailability.upsert({
            where: { employeeId: employee.id },
            create: { employeeId: employee.id, agencyId: employee.agencyId, ...availabilityData },
            update: availabilityData,
        }),
    ]);

    if (skipApproval) {
        // External-account adoption: the email already belongs to a pre-existing
        // (non-onboarding) user, so we skip admin review and activate directly.
        // The employee is typically still invitation_pending here, and
        // invitation_pending → active is NOT a legal lifecycle.transition() edge,
        // so this status write is intentionally raw. This path is NOT reachable
        // on a normal re-submit (that always has isOwnMintedUser === true →
        // skipApproval === false → the pending_review branch below).
        await prisma.employee.update({ where: { id: employee.id }, data: { onboardingStatus: 'active' } });
    } else {
        // invitation_pending|onboarding_in_progress|changes_requested → pending_review.
        // A first-ever submit is typically still invitation_pending (if the employee
        // skipped straight to submit without triggering a first-data save); a
        // re-submit after changes_requested goes straight to pending_review.
        const cur = await prisma.employee.findUnique({ where: { id: employee.id } });
        if (cur.onboardingStatus === 'invitation_pending') {
            await lifecycle.transition(prisma, employee.id, 'onboarding_in_progress');
        }
        await lifecycle.transition(prisma, employee.id, 'pending_review');
    }

    return { employee, user, skipApproval };
}

// Per-item admin review decision on a single EmployeeRequirement (approve/reject).
// Does not move the employee's overall onboarding status — see onboardingLifecycle.js
// for the status machine, which is not invoked here.
async function reviewItem(employeeId, reqId, { decision, reason }) {
    const req = await prisma.employeeRequirement.findUnique({ where: { id: reqId } });
    if (!req || req.employeeId !== employeeId) throw new Error('Requirement not found');
    if (decision === 'rejected') {
        if (!reason || !reason.trim()) throw new Error('Rejection reason required');
        return prisma.employeeRequirement.update({ where: { id: reqId }, data: { reviewStatus: 'rejected', rejectionReason: reason.trim() } });
    }
    return prisma.employeeRequirement.update({ where: { id: reqId }, data: { reviewStatus: 'approved', rejectionReason: '' } });
}

// Admin "finalize review" decision, driven by per-item review outcomes rather than
// a single admin action: if every required EmployeeRequirement is approved, the
// employee moves pending_review → approved → active and their login user is
// activated. If any required item is rejected, the employee is sent back to
// changes_requested and their onboarding token is reopened so they can fix things.
async function finalizeOnboarding(employeeId, actor = {}) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    if (employee.onboardingStatus !== 'pending_review') throw new Error('Employee is not pending review');

    const ledger = await projectLedger(prisma, employeeId);
    const { outcome } = reviewSummary(ledger);
    const meta = { userId: actor.userId, userName: actor.userName, userRole: actor.userRole };

    if (outcome === 'approved') {
        await prisma.$transaction(async (tx) => {
            await lifecycle.transition(tx, employeeId, 'approved', meta);
            await lifecycle.transition(tx, employeeId, 'active', meta);
            if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { status: 'active' } });
        });
        sendWelcomeEmail(employee).catch(err => console.error('Welcome email failed:', err.message));
        return { outcome, employee };
    }

    // changes_requested
    await prisma.$transaction(async (tx) => {
        await lifecycle.transition(tx, employeeId, 'changes_requested', meta);
        await tx.onboardingToken.updateMany({
            where: { employeeId },
            data: { status: 'pending', completedAt: null, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
        });
        // Intentionally do NOT demote the login user to status:'pending' here. The
        // employee must be able to log into the (onboarding-gated) portal to address
        // the requested changes and re-submit. Onboarding gating is driven by
        // employee.onboardingStatus + the employee-app App gate, NOT by user.status.
        // (The employee-login controller also relaxes its pending-status gate for
        // employees whose onboardingStatus is pending_review/changes_requested, so a
        // user still on status:'pending' from first submit can reach the portal too.)
    });
    const active = await prisma.onboardingToken.findFirst({ where: { employeeId, status: 'pending', expiresAt: { gt: new Date() } } });
    if (!active) {
        const token = await createOnboardingToken(prisma, employeeId);
        sendOnboardingEmail(employee, token).catch(err => console.error('Onboarding re-invite email failed:', err.message));
    }
    return { outcome, employee };
}

// Explicit admin decision: approve the whole submission and activate the account,
// regardless of per-item review state. Backs the "Approve & Activate" button.
async function approveOnboardingSubmission(employeeId, actor = {}) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    if (employee.onboardingStatus !== 'pending_review') throw new Error('Employee is not pending review');
    const meta = { userId: actor.userId, userName: actor.userName, userRole: actor.userRole };
    await prisma.$transaction(async (tx) => {
        await lifecycle.transition(tx, employeeId, 'approved', meta);
        await lifecycle.transition(tx, employeeId, 'active', meta);
        if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { status: 'active' } });
    });
    sendWelcomeEmail(employee).catch(err => console.error('Welcome email failed:', err.message));
    return { employee };
}

// Explicit admin decision: send the whole submission back for correction. Moves the
// employee to changes_requested, reopens their onboarding link, and stores the admin's
// note (so they know what to fix). Backs the "Send Back for Correction" button.
async function sendBackOnboarding(employeeId, actor = {}, note = '') {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    if (employee.onboardingStatus !== 'pending_review') throw new Error('Employee is not pending review');
    const meta = { userId: actor.userId, userName: actor.userName, userRole: actor.userRole, detail: { note } };
    await prisma.$transaction(async (tx) => {
        await lifecycle.transition(tx, employeeId, 'changes_requested', meta);
        await tx.employee.update({ where: { id: employeeId }, data: { adminReviewNote: note || '' } });
        await tx.onboardingToken.updateMany({
            where: { employeeId },
            data: { status: 'pending', completedAt: null, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
        });
        // Do NOT demote user.status — see finalizeOnboarding's changes_requested note.
    });
    const active = await prisma.onboardingToken.findFirst({ where: { employeeId, status: 'pending', expiresAt: { gt: new Date() } } });
    if (!active) {
        const token = await createOnboardingToken(prisma, employeeId);
        sendOnboardingEmail(employee, token).catch(err => console.error('Onboarding re-invite email failed:', err.message));
    }
    return { employee };
}

// Explicit admin decision: reject/decline the submission outright. The employee does
// NOT re-enter onboarding — the account is deactivated (onboardingStatus → inactive,
// login user held inactive). Backs the "Reject" button.
async function rejectOnboardingSubmission(employeeId, actor = {}, note = '') {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    if (employee.onboardingStatus !== 'pending_review') throw new Error('Employee is not pending review');
    const meta = { userId: actor.userId, userName: actor.userName, userRole: actor.userRole, detail: { note } };
    await prisma.$transaction(async (tx) => {
        await lifecycle.transition(tx, employeeId, 'inactive', meta);
        // Also flip the legacy `active` boolean so the employees-list status column
        // (which reads employee.active, not onboardingStatus) reflects the rejection.
        await tx.employee.update({ where: { id: employeeId }, data: { adminReviewNote: note || '', active: false } });
        if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { status: 'pending', active: false } });
    });
    return { employee };
}

module.exports = {
    createOnboardingToken,
    sendOnboardingEmail,
    sendWelcomeEmail,
    validateToken,
    completeOnboarding,
    approveOnboardingSubmission,
    sendBackOnboarding,
    rejectOnboardingSubmission,
    reviewItem,
    finalizeOnboarding,
    EMPLOYEE_APP_URL,
};
