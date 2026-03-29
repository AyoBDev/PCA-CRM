const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateEmployees() {
    console.log('Phase 1: Creating Employee records...');

    // 1. Create Employee records from PCA-role Users
    const pcaUsers = await prisma.user.findMany({ where: { role: 'pca' } });
    for (const user of pcaUsers) {
        const existing = await prisma.employee.findFirst({ where: { userId: user.id } });
        if (!existing) {
            await prisma.employee.create({
                data: {
                    name: user.name,
                    phone: user.phone || '',
                    email: user.email || '',
                    userId: user.id,
                },
            });
            console.log(`  Created Employee for User: ${user.name}`);
        }
    }

    // 2. Create Employee records from distinct employeeName values on Shifts
    const shiftsWithNames = await prisma.shift.findMany({
        where: {
            employeeName: { not: '' },
            employeeId: null,
        },
        select: { employeeName: true },
        distinct: ['employeeName'],
    });

    for (const { employeeName } of shiftsWithNames) {
        const existing = await prisma.employee.findFirst({
            where: { name: employeeName },
        });
        if (!existing) {
            await prisma.employee.create({
                data: { name: employeeName },
            });
            console.log(`  Created Employee from shift name: ${employeeName}`);
        }
    }

    // 3. Link shifts to Employee records
    console.log('\nPhase 2: Linking shifts to Employee records...');

    const allShifts = await prisma.shift.findMany();
    let linked = 0;

    for (const shift of allShifts) {
        if (shift.employeeId) continue; // already linked

        if (shift.employeeName) {
            const emp = await prisma.employee.findFirst({
                where: { name: shift.employeeName },
            });
            if (emp) {
                await prisma.shift.update({
                    where: { id: shift.id },
                    data: { employeeId: emp.id },
                });
                linked++;
            }
        }
    }

    console.log(`  Linked ${linked} shifts to Employee records`);

    // 4. Handle orphaned shifts (no employeeName and no employeeId)
    //    These would fail the NOT NULL constraint in the finalize migration
    const orphaned = await prisma.shift.findMany({ where: { employeeId: null } });
    if (orphaned.length > 0) {
        console.log(`\nPhase 3: Assigning ${orphaned.length} orphaned shift(s) to placeholder employee...`);
        let placeholder = await prisma.employee.findFirst({ where: { name: 'Unassigned' } });
        if (!placeholder) {
            placeholder = await prisma.employee.create({ data: { name: 'Unassigned', active: false } });
            console.log('  Created placeholder Employee: Unassigned');
        }
        await prisma.shift.updateMany({
            where: { employeeId: null },
            data: { employeeId: placeholder.id },
        });
        console.log(`  Assigned ${orphaned.length} shift(s) to "Unassigned"`);
    }

    const employees = await prisma.employee.findMany();
    console.log(`\nDone. Total Employee records: ${employees.length}`);
}

migrateEmployees()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
