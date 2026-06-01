const prisma = require('../lib/prisma');
const { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS } = require('../services/taskService');
const { isOverdue } = require('../lib/timesheetUtils');
const audit = require('../services/auditService');

async function evaluateAuthExpiry(trigger, existingTasks) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setUTCDate(thresholdDate.getUTCDate() + trigger.thresholdDays);

    const authorizations = await prisma.authorization.findMany({
        where: {
            authorizationEndDate: { gt: now, lte: thresholdDate },
            archivedAt: null,
        },
        include: { client: true },
    });

    const tasksToCreate = [];
    for (const auth of authorizations) {
        if (!shouldCreateTask(existingTasks, trigger.id, 'Authorization', auth.id)) continue;
        tasksToCreate.push({
            title: generateTaskTitle('auth_expiry', {
                clientName: auth.client.clientName,
                serviceCode: auth.serviceCode,
            }),
            urgency: trigger.urgency,
            dueDate: auth.authorizationEndDate,
            assignedToUserId: trigger.assignToUserId,
            assignedToRole: trigger.assignToRole,
            entityType: 'Authorization',
            entityId: auth.id,
            triggerId: trigger.id,
        });
    }
    return tasksToCreate;
}

async function evaluateTimesheetOverdue(trigger, existingTasks) {
    const overdueTimesheets = await prisma.timesheet.findMany({
        where: {
            status: 'draft',
            archivedAt: null,
        },
        include: { client: true },
    });

    const actuallyOverdue = overdueTimesheets.filter(isOverdue);

    const tasksToCreate = [];
    for (const ts of actuallyOverdue) {
        if (!shouldCreateTask(existingTasks, trigger.id, 'Timesheet', ts.id)) continue;
        tasksToCreate.push({
            title: generateTaskTitle('timesheet_overdue', {
                pcaName: ts.pcaName,
                clientName: ts.client.clientName,
            }),
            urgency: trigger.urgency,
            dueDate: null,
            assignedToUserId: trigger.assignToUserId,
            assignedToRole: trigger.assignToRole,
            entityType: 'Timesheet',
            entityId: ts.id,
            triggerId: trigger.id,
        });
    }
    return tasksToCreate;
}

async function evaluateCredentialExpiry(trigger, existingTasks) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setUTCDate(thresholdDate.getUTCDate() + trigger.thresholdDays);

    const employees = await prisma.employee.findMany({
        where: { archivedAt: null, status: 'active' },
    });

    const tasksToCreate = [];

    for (const emp of employees) {
        for (const { field, label } of CREDENTIAL_FIELDS) {
            const expiryDate = emp[field];
            if (!expiryDate) continue;
            if (expiryDate <= now || expiryDate > thresholdDate) continue;

            const dedupEntityId = emp.id * 100 + CREDENTIAL_FIELDS.findIndex((f) => f.field === field);
            if (!shouldCreateTask(existingTasks, trigger.id, 'Employee', dedupEntityId)) continue;

            tasksToCreate.push({
                title: generateTaskTitle('credential_expiry', {
                    employeeName: emp.name,
                    credentialType: label,
                }),
                urgency: trigger.urgency,
                dueDate: expiryDate,
                assignedToUserId: trigger.assignToUserId,
                assignedToRole: trigger.assignToRole,
                entityType: 'Employee',
                entityId: dedupEntityId,
                triggerId: trigger.id,
            });
        }
    }

    const certifications = await prisma.employeeCertification.findMany({
        where: {
            expirationDate: { gt: now, lte: thresholdDate },
            status: 'active',
        },
        include: { employee: true },
    });

    for (const cert of certifications) {
        if (!cert.employee || cert.employee.archivedAt) continue;
        const dedupEntityId = cert.employee.id * 100 + 50 + cert.id;
        if (!shouldCreateTask(existingTasks, trigger.id, 'Employee', dedupEntityId)) continue;

        tasksToCreate.push({
            title: generateTaskTitle('credential_expiry', {
                employeeName: cert.employee.name,
                credentialType: cert.certType,
            }),
            urgency: trigger.urgency,
            dueDate: cert.expirationDate,
            assignedToUserId: trigger.assignToUserId,
            assignedToRole: trigger.assignToRole,
            entityType: 'Employee',
            entityId: dedupEntityId,
            triggerId: trigger.id,
        });
    }

    return tasksToCreate;
}

async function runTaskTriggers() {
    const triggers = await prisma.workflowTrigger.findMany({ where: { enabled: true } });
    if (triggers.length === 0) {
        console.log('[TaskTriggers] No enabled triggers, skipping.');
        return { created: 0 };
    }

    const existingTasks = await prisma.task.findMany({
        where: { status: { in: ['open', 'in_progress'] } },
        select: { triggerId: true, entityType: true, entityId: true, status: true },
    });

    let created = 0;

    for (const trigger of triggers) {
        let tasksToCreate = [];
        try {
            switch (trigger.type) {
                case 'auth_expiry':
                    tasksToCreate = await evaluateAuthExpiry(trigger, existingTasks);
                    break;
                case 'timesheet_overdue':
                    tasksToCreate = await evaluateTimesheetOverdue(trigger, existingTasks);
                    break;
                case 'credential_expiry':
                    tasksToCreate = await evaluateCredentialExpiry(trigger, existingTasks);
                    break;
                default:
                    console.log(`[TaskTriggers] Unknown trigger type: ${trigger.type}`);
            }
        } catch (err) {
            console.error(`[TaskTriggers] Error evaluating trigger ${trigger.name}:`, err.message);
            continue;
        }

        for (const taskData of tasksToCreate) {
            try {
                const task = await prisma.task.create({ data: taskData });
                audit.logAction({
                    userId: 0,
                    userName: 'System',
                    userRole: 'system',
                    action: 'CREATE',
                    entityType: 'Task',
                    entityId: task.id,
                    entityName: task.title,
                    changes: [],
                    metadata: { trigger: trigger.type, source: 'system' },
                });
                created++;
            } catch (err) {
                console.error(`[TaskTriggers] Failed to create task "${taskData.title}":`, err.message);
            }
        }
    }

    console.log(`[TaskTriggers] Done. Created: ${created}`);
    return { created };
}

module.exports = { runTaskTriggers };
