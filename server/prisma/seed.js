const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { seedPermissionGroups } = require('./seed-permission-groups');

const prisma = new PrismaClient();

async function main() {
    const email = process.env.ADMIN_EMAIL || 'admin@nvbestpca.com';

    // Check if admin already exists — never overwrite an existing account
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        console.log('✅ Admin already exists — skipping admin creation');
    } else {
        // Only create on first deploy; use env vars or fallbacks
        const password = process.env.ADMIN_PASSWORD || 'admin123';
        const passwordHash = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                email,
                passwordHash,
                name: 'Admin',
                role: 'admin',
            },
        });

        console.log(`✅ Admin created: ${email}`);
        if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
            console.warn('⚠️  Set ADMIN_EMAIL and ADMIN_PASSWORD env vars for production');
        }
    }

    // Seed insurance types (always runs)
    const insuranceTypes = ['MEDICAID', 'Molina', 'SilverSummit', 'CareSource', 'Aging and Disability', 'CognitiveCare', 'Private Pay', 'Other'];
    for (const name of insuranceTypes) {
        await prisma.insuranceType.upsert({
            where: { name },
            update: {},
            create: { name },
        });
    }
    console.log('✅ Insurance types seeded');

    // Seed default workflow triggers
    const defaultTriggers = [
        { name: 'Authorization Expiry Warning', type: 'auth_expiry', thresholdDays: 30, urgency: 'high' },
        { name: 'Overdue Timesheet Follow-up', type: 'timesheet_overdue', thresholdDays: 1, urgency: 'medium' },
        { name: 'Credential Expiry Warning', type: 'credential_expiry', thresholdDays: 14, urgency: 'high' },
    ];
    for (const trigger of defaultTriggers) {
        const existing = await prisma.workflowTrigger.findFirst({ where: { type: trigger.type } });
        if (!existing) {
            await prisma.workflowTrigger.create({ data: trigger });
        }
    }
    console.log('✅ Workflow triggers seeded');

    // Seed default admin file folders (skip if table doesn't exist yet)
    try {
        const defaultFolders = [
            { name: 'Insurance', path: '/Insurance', parentId: null },
            { name: 'Eligibility', path: '/Eligibility', parentId: null },
        ];
        for (const folder of defaultFolders) {
            const existing = await prisma.adminFolder.findFirst({
                where: { name: folder.name, parentId: null },
            });
            if (!existing) {
                const created = await prisma.adminFolder.create({ data: folder });
                if (folder.name === 'Insurance') {
                    const subs = ['Medicaid', 'UnitedHealth', 'Blue Cross Blue Shield', 'Aetna'];
                    for (const sub of subs) {
                        await prisma.adminFolder.create({
                            data: { name: sub, path: `/Insurance/${sub}`, parentId: created.id },
                        });
                    }
                } else if (folder.name === 'Eligibility') {
                    const subs = ['Active', 'Pending', 'Expired'];
                    for (const sub of subs) {
                        await prisma.adminFolder.create({
                            data: { name: sub, path: `/Eligibility/${sub}`, parentId: created.id },
                        });
                    }
                }
            }
        }
        console.log('✅ Admin file folders seeded');
    } catch (err) {
        if (err.code === 'P2021') {
            console.log('⚠️  admin_folders table not found — skipping folder seed (run migrations first)');
        } else {
            throw err;
        }
    }

    await seedPermissionGroups(prisma);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
