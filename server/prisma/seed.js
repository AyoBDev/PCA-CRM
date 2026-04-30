const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = process.env.ADMIN_EMAIL || 'admin@nvbestpca.com';

    // Check if admin already exists — never overwrite an existing account
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        console.log('✅ Admin already exists — skipping seed (password unchanged)');
        return;
    }

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

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
