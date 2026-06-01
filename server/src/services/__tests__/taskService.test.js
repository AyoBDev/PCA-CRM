const { generateTaskTitle, shouldCreateTask, CREDENTIAL_FIELDS } = require('../taskService');

describe('generateTaskTitle', () => {
    test('auth_expiry generates title with client and service', () => {
        const result = generateTaskTitle('auth_expiry', {
            clientName: 'John Smith',
            serviceCode: 'PCS',
        });
        expect(result).toBe('Authorization expiring: John Smith - PCS');
    });

    test('timesheet_overdue generates title with PCA and client', () => {
        const result = generateTaskTitle('timesheet_overdue', {
            pcaName: 'Jane Doe',
            clientName: 'Bob Wilson',
        });
        expect(result).toBe('Overdue timesheet: Jane Doe - Bob Wilson');
    });

    test('credential_expiry generates title with employee and credential', () => {
        const result = generateTaskTitle('credential_expiry', {
            employeeName: 'Jane Doe',
            credentialType: 'CPR Certification',
        });
        expect(result).toBe('Credential expiring: Jane Doe - CPR Certification');
    });

    test('unknown type returns generic title', () => {
        const result = generateTaskTitle('unknown', { name: 'test' });
        expect(result).toBe('Task: unknown');
    });
});

describe('shouldCreateTask', () => {
    test('returns true when no existing task matches', () => {
        const existingTasks = [];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(true);
    });

    test('returns false when open task exists for same trigger+entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 5, status: 'open' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(false);
    });

    test('returns false when in_progress task exists for same trigger+entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 5, status: 'in_progress' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(false);
    });

    test('returns true when only completed task exists for same trigger+entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 5, status: 'completed' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(true);
    });

    test('returns true when task exists for different entity', () => {
        const existingTasks = [
            { triggerId: 1, entityType: 'Authorization', entityId: 99, status: 'open' },
        ];
        expect(shouldCreateTask(existingTasks, 1, 'Authorization', 5)).toBe(true);
    });
});

describe('CREDENTIAL_FIELDS', () => {
    test('contains expected employee date fields', () => {
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'idExpDate', label: 'ID' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'tbDueDate', label: 'TB Test' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'cprDueDate', label: 'CPR Certification' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'trainingDueDate', label: 'Training' });
        expect(CREDENTIAL_FIELDS).toContainEqual({ field: 'backgroundCheckDueDate', label: 'Background Check' });
    });
});
