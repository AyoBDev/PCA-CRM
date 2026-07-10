// Cron driver: enumerates active agencies on the owner connection, then runs
// trigger evaluation for each agency inside its own tenant context.
const prisma = require('../lib/prisma');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS } = require('../services/taskService');
const { isOverdue } = require('../lib/timesheetUtils');
const audit = require('../services/auditService');

async function evaluateAuthExpiry(db, trigger, existingTasks) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setUTCDate(thresholdDate.getUTCDate() + trigger.thresholdDays);

    const authorizations = await db.authorization.findMany({
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

async function evaluateTimesheetOverdue(db, trigger, existingTasks) {
    const overdueTimesheets = await db.timesheet.findMany({
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

async function evaluateCredentialExpiry(db, trigger, existingTasks) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setUTCDate(thresholdDate.getUTCDate() + trigger.thresholdDays);

    const employees = await db.employee.findMany({
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

    const certifications = await db.employeeCertification.findMany({
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

// Runs trigger evaluation for a single tenant's `db`.
async function runTaskTriggersForAgency(db) {
    const triggers = await db.workflowTrigger.findMany({ where: { enabled: true } });
    if (triggers.length === 0) {
        console.log('[TaskTriggers] No enabled triggers, skipping.');
        return { created: 0 };
    }

    const existingTasks = await db.task.findMany({
        where: { status: { in: ['open', 'in_progress'] } },
        select: { triggerId: true, entityType: true, entityId: true, status: true },
    });

    let created = 0;

    for (const trigger of triggers) {
        let tasksToCreate = [];
        try {
            switch (trigger.type) {
                case 'auth_expiry':
                    tasksToCreate = await evaluateAuthExpiry(db, trigger, existingTasks);
                    break;
                case 'timesheet_overdue':
                    tasksToCreate = await evaluateTimesheetOverdue(db, trigger, existingTasks);
                    break;
                case 'credential_expiry':
                    tasksToCreate = await evaluateCredentialExpiry(db, trigger, existingTasks);
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
                const task = await db.task.create({ data: taskData });
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

// Cron entry point: iterates every active agency and runs evaluation for each.
async function runTaskTriggers() {
    const agencies = await prisma.agency.findMany({ where: { status: 'active' } });
    const totals = { created: 0 };
    for (const agency of agencies) {
        const db = tenantClient(agency.id);
        const result = await runWithTenant({ agencyId: agency.id, db }, () => runTaskTriggersForAgency(db));
        totals.created += result.created;
    }
    return totals;
}

module.exports = { runTaskTriggers, runTaskTriggersForAgency };
