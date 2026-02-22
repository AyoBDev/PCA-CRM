const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@nvbestpca.com';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log('Admin user already exists, skipping seed.');
        return;
    }
    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
        data: {
            email,
            passwordHash,
            name: 'Admin',
            role: 'admin',
        },
    });
    console.log('✅ Default admin created: admin@nvbestpca.com / admin123');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
