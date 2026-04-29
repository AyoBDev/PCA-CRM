const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@nvbestpca.com';
    const passwordHash = await bcrypt.hash('admin123', 10);

    await prisma.user.upsert({
        where: { email },
        update: { passwordHash },   // force reset password on every deploy
        create: {
            email,
            passwordHash,
            name: 'Admin',
            role: 'admin',
        },
    });

    console.log('✅ Admin upserted: admin@nvbestpca.com / admin123');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());