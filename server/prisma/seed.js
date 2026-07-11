const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { seedPermissionGroups } = require('./seed-permission-groups');
const { seedAgencyDefaults } = require('./seedAgencyDefaults');

const prisma = new PrismaClient();

async function main() {
    // 1. Ensure agency #1 exists (single-agency dev/legacy deployments get one
    // automatically; the platform console creates additional agencies).
    let agency = await prisma.agency.findFirst({ orderBy: { id: 'asc' } });
    if (!agency) {
        agency = await prisma.agency.create({
            data: {
                name: process.env.NVBEST_AGENCY_NAME || 'NV Best PCA',
                slug: process.env.NVBEST_AGENCY_SLUG || 'nvbest',
            },
        });
        console.log(`✅ Agency created: ${agency.name} (${agency.slug})`);
    } else {
        console.log(`✅ Agency already exists — skipping agency creation (${agency.slug})`);
    }

    // 2. Superadmin bootstrap — platform-level account, no agencyId.
    const superadminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@nvbestpca.com';
    const existingSuperadmin = await prisma.user.findFirst({ where: { email: superadminEmail, agencyId: null } });
    if (existingSuperadmin) {
        console.log('✅ Superadmin already exists — skipping superadmin creation');
    } else {
        const isProd = process.env.NODE_ENV === 'production';
        if (isProd && !process.env.SUPERADMIN_PASSWORD) {
            throw new Error('SUPERADMIN_PASSWORD is not set. Refusing to create a default-credential superadmin in production.');
        }
        const superadminPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
        const superadminPasswordHash = await bcrypt.hash(superadminPassword, 10);

        await prisma.user.create({
            data: {
                email: superadminEmail,
                passwordHash: superadminPasswordHash,
                name: 'Super Admin',
                role: 'superadmin',
                agencyId: null,
            },
        });

        console.log(`✅ Superadmin created: ${superadminEmail}`);
        if (!process.env.SUPERADMIN_EMAIL || !process.env.SUPERADMIN_PASSWORD) {
            console.warn('⚠️  Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD env vars for production');
        }
    }

    // 3. Agency-scoped admin bootstrap (legacy ADMIN_EMAIL/ADMIN_PASSWORD flow).
    const email = process.env.ADMIN_EMAIL || 'admin@nvbestpca.com';

    // Check if admin already exists — never overwrite an existing account
    const existing = await prisma.user.findFirst({ where: { email, agencyId: agency.id } });

    if (existing) {
        console.log('✅ Admin already exists — skipping admin creation');
    } else {
        // Only create on first deploy. In production we refuse to seed a
        // default-credential admin: a known password committed in source would
        // be an immediate account-takeover foothold. Non-production keeps a
        // convenience fallback for local setup.
        const isProd = process.env.NODE_ENV === 'production';
        if (isProd && !process.env.ADMIN_PASSWORD) {
            throw new Error('ADMIN_PASSWORD is not set. Refusing to create a default-credential admin in production.');
        }
        const password = process.env.ADMIN_PASSWORD || 'admin123';
        const passwordHash = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                email,
                passwordHash,
                name: 'Admin',
                role: 'admin',
                agencyId: agency.id,
            },
        });

        console.log(`✅ Admin created: ${email}`);
        if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
            console.warn('⚠️  Set ADMIN_EMAIL and ADMIN_PASSWORD env vars for production');
        }
    }

    // 4. Reference data (insurance types, services, workflow triggers, admin folders)
    await seedAgencyDefaults(prisma, agency.id);
    console.log('✅ Agency defaults seeded');

    await seedPermissionGroups(prisma, agency.id);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
