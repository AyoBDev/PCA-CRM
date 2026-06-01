const CREDENTIAL_FIELDS = [
    { field: 'idExpDate', label: 'ID' },
    { field: 'tbDueDate', label: 'TB Test' },
    { field: 'cprDueDate', label: 'CPR Certification' },
    { field: 'trainingDueDate', label: 'Training' },
    { field: 'backgroundCheckDueDate', label: 'Background Check' },
];

function generateTaskTitle(triggerType, context) {
    switch (triggerType) {
        case 'auth_expiry':
            return `Authorization expiring: ${context.clientName} - ${context.serviceCode}`;
        case 'timesheet_overdue':
            return `Overdue timesheet: ${context.pcaName} - ${context.clientName}`;
        case 'credential_expiry':
            return `Credential expiring: ${context.employeeName} - ${context.credentialType}`;
        default:
            return `Task: ${triggerType}`;
    }
}

function shouldCreateTask(existingTasks, triggerId, entityType, entityId) {
    return !existingTasks.some(
        (t) =>
            t.triggerId === triggerId &&
            t.entityType === entityType &&
            t.entityId === entityId &&
            (t.status === 'open' || t.status === 'in_progress')
    );
}

module.exports = { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS };
