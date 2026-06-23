const prisma = require('../lib/prisma');
const audit = require('../services/auditService');
const onboarding = require('../services/onboardingService');

async function listEmployees(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        if (req.query.active === 'true') where.active = true;
        if (req.query.active === 'false') where.active = false;

        const employees = await prisma.employee.findMany({
            where,
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { name: 'asc' },
        });
        res.json(employees);
    } catch (err) { next(err); }
}

async function getEmployee(req, res, next) {
    try {
        const employee = await prisma.employee.findUnique({
            where: { id: Number(req.params.id) },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        res.json(employee);
    } catch (err) { next(err); }
}

async function createEmployee(req, res, next) {
    try {
        const { name, phone, email, userId } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

        const employee = await prisma.employee.create({
            data: {
                name: name.trim(),
                phone: phone || '',
                email: email || '',
                userId: userId || null,
            },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name });

        // Auto-send onboarding invite if email provided and no user account linked
        if (employee.email && !userId) {
            await prisma.employee.update({ where: { id: employee.id }, data: { onboardingStatus: 'invited' } });
            employee.onboardingStatus = 'invited';
            const token = await onboarding.createOnboardingToken(employee.id);
            onboarding.sendOnboardingEmail(employee, token).catch(err => console.error('Onboarding email failed:', err.message));
            audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, metadata: { action: 'onboarding_invite_sent' } });
        }

        res.status(201).json(employee);
    } catch (err) { next(err); }
}

async function updateEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const oldEmployee = await prisma.employee.findUnique({ where: { id } });
        if (!oldEmployee) return res.status(404).json({ error: 'Employee not found' });

        const fields = ['name', 'phone', 'email', 'userId', 'active', 'address', 'clientAssignment', 'npi', 'dob', 'idExpDate', 'firstAssignmentDate', 'tbDueDate', 'tbType', 'cprDueDate', 'trainingDueDate', 'backgroundCheckDueDate', 'dischargeDate', 'status', 'notes', 'critical'];
        const data = {};
        for (const f of fields) {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        }
        if (data.name) data.name = data.name.trim();

        const employee = await prisma.employee.update({
            where: { id },
            data,
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        const changes = audit.diffFields(oldEmployee, employee, Object.keys(data));
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Employee', entityId: employee.id, entityName: employee.name, changes });
        res.json(employee);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Employee not found' });
        next(err);
    }
}

async function deleteEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await prisma.employee.findUnique({ where: { id } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const archived = await prisma.employee.update({ where: { id }, data: { archivedAt: new Date() } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Employee', entityId: id, entityName: employee.name });
        res.json(archived);
    } catch (err) { next(err); }
}

async function restoreEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const employee = await prisma.employee.findUnique({ where: { id } });
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        const restored = await prisma.employee.update({
            where: { id }, data: { archivedAt: null },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
        });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'Employee', entityId: id, entityName: restored.name });
        res.json(restored);
    } catch (err) { next(err); }
}

async function permanentlyDeleteEmployee(req, res, next) {
    try {
        const id = Number(req.params.id);
        const emp = await prisma.employee.findUnique({ where: { id } });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        if (!emp.archivedAt) return res.status(400).json({ error: 'Only archived employees can be permanently deleted' });
        // Clear shifts referencing this employee (Shift uses onDelete: Restrict)
        await prisma.shift.deleteMany({ where: { employeeId: id } });
        await prisma.employee.delete({ where: { id } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'PERMANENT_DELETE', entityType: 'Employee', entityId: id, entityName: emp.name });
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function bulkPermanentlyDeleteEmployees(req, res, next) {
    try {
        // Clear shifts referencing archived employees (Shift uses onDelete: Restrict)
        await prisma.shift.deleteMany({ where: { employee: { archivedAt: { not: null } } } });
        const result = await prisma.employee.deleteMany({ where: { archivedAt: { not: null } } });
        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'BULK_DELETE', entityType: 'Employee', entityId: 0, metadata: { count: result.count } });
        res.json({ success: true, count: result.count });
    } catch (err) { next(err); }
}

async function bulkImportEmployees(req, res, next) {
    try {
        const XLSX = require('xlsx');
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        function excelDate(serial) {
            if (!serial || typeof serial !== 'number' || serial < 1000) return null;
            return new Date((serial - 25569) * 86400000);
        }

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
        for (let i = 0; i < sections.length; i++) {
            sections[i].endRow = i + 1 < sections.length ? sections[i + 1].headerRow - 2 : data.length - 1;
        }

        let created = 0, updated = 0;

        for (const section of sections) {
            const isCritical = section.label.toLowerCase().includes('critical');
            const isInactive = section.label.toLowerCase().includes('inactive');

            for (let i = section.startRow; i <= section.endRow; i++) {
                const row = data[i];
                if (!row || !row[0] || typeof row[0] !== 'string' || row[0].trim().length === 0) continue;

                const name = row[0].trim();
                const employeeData = {
                    name,
                    phone: row[3] ? String(row[3]).replace(/\D/g, '').slice(0, 10) : '',
                    email: (row[6] || '').toString().trim(),
                    address: (row[4] || '').toString().trim(),
                    clientAssignment: (row[5] || '').toString().trim(),
                    npi: (row[20] || '').toString().trim(),
                    dob: excelDate(row[1]),
                    idExpDate: excelDate(row[7]),
                    firstAssignmentDate: excelDate(row[8]),
                    tbDueDate: excelDate(row[9]),
                    tbType: (row[10] || '').toString().trim(),
                    cprDueDate: excelDate(row[12]),
                    trainingDueDate: excelDate(row[14]),
                    backgroundCheckDueDate: excelDate(row[17]),
                    dischargeDate: excelDate(row[23]),
                    status: (row[21] || 'active').toString().trim(),
                    notes: (row[22] || '').toString().trim(),
                    critical: isCritical,
                    active: !isInactive,
                    archivedAt: isInactive ? new Date() : null,
                };

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

        audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Employee', entityId: 0, entityName: 'Bulk Import', metadata: { created, updated } });

        const employees = await prisma.employee.findMany({
            where: { archivedAt: null },
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { name: 'asc' },
        });
        res.status(201).json({ imported: created + updated, created, updated, employees });
    } catch (err) { next(err); }
}

// POST /api/employees/restore (bulk)
async function restoreEmployees(req, res, next) {
    try {
        const { employeeIds } = req.body;
        if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ error: 'employeeIds array is required' });
        }
        const result = await prisma.employee.updateMany({
            where: { id: { in: employeeIds.map(Number) }, archivedAt: { not: null } },
            data: { archivedAt: null },
        });
        audit.logAction({
            userId: req.user.id, userName: req.user.name, userRole: req.user.role,
            action: 'RESTORE', entityType: 'Employee', entityId: employeeIds[0],
            metadata: { bulk: true, count: result.count, employeeIds },
        });
        res.json({ restored: result.count });
    } catch (err) { next(err); }
}

// GET /api/employees/archived
async function listArchivedEmployees(req, res, next) {
    try {
        const employees = await prisma.employee.findMany({
            where: { archivedAt: { not: null } },
            orderBy: { archivedAt: 'desc' },
            take: 200,
        });
        res.json(employees.map(e => ({
            id: e.id,
            label: e.name || 'Unknown',
            name: e.name,
            archivedAt: e.archivedAt,
            deletedBy: 'Admin',
            deletedAt: e.archivedAt ? new Date(e.archivedAt).toLocaleString() : '',
        })));
    } catch (err) { next(err); }
}

async function getEmployeeAvailability(req, res, next) {
    try {
        const id = Number(req.params.id);
        const availability = await prisma.employeeAvailability.findUnique({
            where: { employeeId: id },
        });
        if (!availability) return res.status(404).json({ error: 'No availability data found' });
        res.json(availability);
    } catch (err) { next(err); }
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee, restoreEmployee, permanentlyDeleteEmployee, bulkPermanentlyDeleteEmployees, bulkImportEmployees, restoreEmployees, listArchivedEmployees, getEmployeeAvailability };
