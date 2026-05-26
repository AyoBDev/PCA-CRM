#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

const FILE = process.argv[2] || path.join(__dirname, '..', 'data', 'employees.xlsx');

function excelDateToISO(serial) {
    if (!serial || typeof serial !== 'number' || serial < 1000) return null;
    return new Date((serial - 25569) * 86400000);
}

function parsePhone(val) {
    if (!val) return '';
    return String(val).replace(/\D/g, '').slice(0, 10);
}

async function main() {
    console.log(`Reading: ${FILE}`);
    const wb = XLSX.readFile(FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find sections
    const sections = [];
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row && row.length <= 2 && typeof row[0] === 'string') {
            const label = row[0].trim().toLowerCase();
            if (label === 'critical list' || label === 'all employees' || label === 'inactive employees') {
                sections.push({ label: row[0].trim(), headerRow: i + 1, startRow: i + 2 });
            }
        }
    }

    // Determine end of each section
    for (let i = 0; i < sections.length; i++) {
        sections[i].endRow = i + 1 < sections.length ? sections[i + 1].headerRow - 2 : data.length - 1;
    }

    let created = 0, updated = 0, skipped = 0;

    for (const section of sections) {
        const isCritical = section.label.toLowerCase().includes('critical');
        const isInactive = section.label.toLowerCase().includes('inactive');

        for (let i = section.startRow; i <= section.endRow; i++) {
            const row = data[i];
            if (!row || !row[0] || typeof row[0] !== 'string' || row[0].trim().length === 0) continue;

            const name = row[0].trim();
            const dob = excelDateToISO(row[1]);
            const phone = parsePhone(row[3]);
            const address = (row[4] || '').toString().trim();
            const clientAssignment = (row[5] || '').toString().trim();
            const email = (row[6] || '').toString().trim();
            const idExpDate = excelDateToISO(row[7]);
            const firstAssignmentDate = excelDateToISO(row[8]);
            const tbDueDate = excelDateToISO(row[9]);
            const tbType = (row[10] || '').toString().trim();
            const cprDueDate = excelDateToISO(row[12]);
            const trainingDueDate = excelDateToISO(row[14]);
            const backgroundCheckDueDate = excelDateToISO(row[17]);
            const npi = (row[20] || '').toString().trim();
            const status = (row[21] || 'active').toString().trim();
            const notes = (row[22] || '').toString().trim();
            const dischargeDate = excelDateToISO(row[23]);

            const employeeData = {
                name,
                phone,
                email,
                address,
                clientAssignment,
                npi,
                dob,
                idExpDate,
                firstAssignmentDate,
                tbDueDate,
                tbType,
                cprDueDate,
                trainingDueDate,
                backgroundCheckDueDate,
                dischargeDate,
                status,
                notes,
                critical: isCritical,
                active: !isInactive,
                archivedAt: isInactive ? new Date() : null,
            };

            // Try to find existing employee by name
            const existing = await prisma.employee.findFirst({ where: { name } });

            if (existing) {
                await prisma.employee.update({ where: { id: existing.id }, data: employeeData });
                updated++;
            } else {
                await prisma.employee.create({ data: employeeData });
                created++;
            }
        }
    }

    console.log(`Done: ${created} created, ${updated} updated, ${skipped} skipped`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
