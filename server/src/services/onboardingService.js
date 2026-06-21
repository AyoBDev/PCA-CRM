const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { isEmailConfigured, sendEmail } = require('./notificationService');

const ONBOARDING_EXPIRY_DAYS = 7;
const EMPLOYEE_APP_URL = process.env.EMPLOYEE_APP_URL || 'http://localhost:5174';

async function createOnboardingToken(employeeId) {
    await prisma.onboardingToken.deleteMany({ where: { employeeId } });
    const expiresAt = new Date(Date.now() + ONBOARDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    return prisma.onboardingToken.create({
        data: { employeeId, expiresAt },
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

    const passwordHash = await bcrypt.hash(password, 10);
    const email = employee.email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({ where: { email } });
    let user;
    if (existingUser) {
        user = await prisma.user.update({
            where: { id: existingUser.id },
            data: { passwordHash, status: 'pending' },
        });
    } else {
        user = await prisma.user.create({
            data: { email, passwordHash, name: employee.name, role: 'pca', status: 'pending' },
        });
    }

    await prisma.$transaction([
        prisma.employee.update({
            where: { id: employee.id },
            data: { userId: user.id, onboardingStatus: 'submitted' },
        }),
        prisma.onboardingToken.update({
            where: { id: token.id },
            data: { status: 'completed', completedAt: new Date() },
        }),
        prisma.employeeAvailability.create({
            data: {
                employeeId: employee.id,
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
            },
        }),
    ]);

    return { employee, user };
}

async function approveOnboarding(employeeId) {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: true },
    });
    if (!employee) throw new Error('Employee not found');
    if (employee.onboardingStatus !== 'submitted') throw new Error('Employee is not pending approval');

    await prisma.$transaction([
        prisma.employee.update({
            where: { id: employeeId },
            data: { onboardingStatus: 'active' },
        }),
        prisma.user.update({
            where: { id: employee.userId },
            data: { status: 'active' },
        }),
    ]);

    sendWelcomeEmail(employee).catch(err => console.error('Welcome email failed:', err.message));
    return employee;
}

module.exports = {
    createOnboardingToken,
    sendOnboardingEmail,
    sendWelcomeEmail,
    validateToken,
    completeOnboarding,
    approveOnboarding,
    EMPLOYEE_APP_URL,
};
