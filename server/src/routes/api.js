const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const {
    listClients,
    getClient,
    createClient,
    updateClient,
    patchClient,
    deleteClient,
    bulkDelete,
    bulkImport,
    restoreClient,
    permanentlyDeleteClient,
    bulkPermanentlyDeleteClients,
    mergeClients,
    restoreClients,
    listArchivedClients,
} = require('../controllers/clientController');
const {
    createAuthorization,
    updateAuthorization,
    archiveAuthorization,
    restoreAuthorization,
    deleteAuthorization,
    updateAccountNumber,
    updateSandataClientId,
    updateAuthManualStatus,
    renewAuthorization,
    dedupAuthorizations,
} = require('../controllers/authorizationController');
const {
    listInsuranceTypes,
    createInsuranceType,
    updateInsuranceType,
    deleteInsuranceType,
    restoreInsuranceType,
    permanentlyDeleteInsuranceType,
    bulkPermanentlyDeleteInsuranceTypes,
} = require('../controllers/insuranceTypeController');
const {
    listServices,
    createService,
    updateService,
    deleteService,
    restoreService,
    permanentlyDeleteService,
    bulkPermanentlyDeleteServices,
} = require('../controllers/serviceController');
const {
    listTimesheets,
    getTimesheet,
    getActivities,
    createTimesheet,
    updateTimesheet,
    submitTimesheet,
    deleteTimesheet,
    restoreTimesheet,
    permanentlyDeleteTimesheet,
    bulkPermanentlyDeleteTimesheets,
    exportTimesheetPdf,
    exportBulkTimesheetPdf,
    updateTimesheetStatus,
    sendTimesheetReminders,
} = require('../controllers/timesheetController');
const { createPermanentLink, listPermanentLinks, deletePermanentLink } = require('../controllers/permanentLinkController');
const { getPcaForm, updatePcaForm } = require('../controllers/pcaFormController');
const {
    login,
    employeeLogin,
    getMe,
    register,
    listUsers,
    deleteUser,
    restoreUser,
    resetPassword,
    permanentlyDeleteUser,
    bulkPermanentlyDeleteUsers,
    forgotPassword,
    resetPasswordWithToken,
    toggleUserActive,
} = require('../controllers/authController');
const {
    generateSigningLinks,
    getSigningForm,
    submitSigningForm,
} = require('../controllers/signingController');
const {
    uploadPayrollRun,
    listPayrollRuns,
    getPayrollRun,
    updatePayrollRun,
    deletePayrollRun,
    restorePayrollRun,
    permanentlyDeletePayrollRun,
    bulkPermanentlyDeletePayrollRuns,
    exportPayrollRun,
    updatePayrollVisit,
    updatePayrollVisitNotes,
} = require('../controllers/payrollController');
const {
    listShifts,
    createShift,
    updateShift,
    deleteShift,
    getClientSchedule,
    getEmployeeSchedule,
    deleteAllShifts,
    bulkUpdateShifts,
    bulkUpdateShiftsPerShift,
    bulkDeleteShifts,
    bulkUndoBatch,
    listBulkEditBatches,
    authCheck,
    restoreShift,
    repeatShift,
    restoreShifts,
    permanentDeleteShifts,
    listArchivedShifts,
} = require('../controllers/schedulingController');
const {
    listEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    restoreEmployee,
    permanentlyDeleteEmployee,
    bulkPermanentlyDeleteEmployees,
    bulkImportEmployees,
    restoreEmployees,
    listArchivedEmployees,
    getEmployeeAvailability,
} = require('../controllers/employeeController');
const { listCertifications, createCertification, updateCertification, deleteCertification, downloadCertification } = require('../controllers/employeeCertController');
const { getDashboardStats } = require('../controllers/dashboardController');
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule, respondToSchedule, getScheduleResponses, recordOpen, getNotificationForView, getEmployeeNotificationHistory } = require('../controllers/scheduleNotificationController');
const { createLink, listLinks, deleteLink, getScheduleView } = require('../controllers/employeeScheduleLinkController');
const { getAuditLogs, getEntityAuditLogs } = require('../controllers/auditController');
const { exportBackup } = require('../controllers/backupController');
const {
    addCareTeamMember,
    removeCareTeamMember,
    listHospitalVisits,
    createHospitalVisit,
    updateHospitalVisit,
    deleteHospitalVisit,
    listIncidents,
    createIncident,
    updateIncident,
    deleteIncident,
} = require('../controllers/carePlanController');
const { uploadDocument, downloadDocument, deleteDocument } = require('../controllers/documentController');
const { uploadAuthDocument, downloadAuthDocument, deleteAuthDocument } = require('../controllers/authDocumentController');
const {
    listFolders, getFolder, createFolder, updateFolder, deleteFolder, restoreFolder,
    uploadFile, downloadFile, replaceFile, updateFile, deleteFile, copyFile, searchFiles, exportFiles,
} = require('../controllers/fileManagerController');
const { listActivities, createActivity, deleteActivity } = require('../controllers/activityController');
const { listTasks, getTask, createTask, updateTask, deleteTask, bulkUpdateTasks, getTaskSummary } = require('../controllers/taskController');
const { listWorkflowTriggers, updateWorkflowTrigger } = require('../controllers/workflowTriggerController');
const { getPayrollProfile, upsertPayrollProfile, revealSensitiveField } = require('../controllers/payrollProfileController');
const { listReceipts, previewReceipts, generateReceipts, updateReceipt, finalizeReceipts, sendReceipts, downloadReceiptPdf } = require('../controllers/receiptController');
const { previewSandata, applySandata, undoSandata } = require('../controllers/sandataController');
const { listConversations, getConversationMessages, adminSendMessage, markConversationRead, getUnreadSummary } = require('../controllers/employeePortal/adminChatController');
const { getOnboardingInfo, completeOnboarding, resendInvite, approveOnboarding, getOnboardingLink } = require('../controllers/onboardingController');
const {
    listPermissionGroups,
    getPermissionGroup,
    createPermissionGroup,
    updatePermissionGroup,
    archivePermissionGroup,
    getPermissionKeys,
    assignUserPermissionGroup,
} = require('../controllers/permissionGroupController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const employeeRoutes = require('./employee');

const router = express.Router();

// ── Employee Portal routes (own auth middleware) ──
router.use('/employee', employeeRoutes);

// ── Public routes (no auth) ──
router.post('/auth/login', login);
router.post('/auth/employee-login', employeeLogin);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password-with-token', resetPasswordWithToken);
router.get('/sign/:token', getSigningForm);
router.put('/sign/:token', submitSigningForm);
router.get('/schedule/confirm/:token', getScheduleConfirm);
router.put('/schedule/confirm/:token', confirmSchedule);
router.put('/schedule/respond/:token', respondToSchedule);
router.get('/schedule/view/:token', getScheduleView);
router.post('/schedule/view/:token/open', recordOpen);
router.get('/schedule/view/:token/notification', getNotificationForView);
router.get('/pca-form/:token', getPcaForm);
router.put('/pca-form/:token', updatePcaForm);
router.get('/onboarding/:token', getOnboardingInfo);
router.post('/onboarding/:token/complete', completeOnboarding);

// Backup (admin JWT or dedicated API key — must be above authenticate middleware)
function backupAuth(req, res, next) {
    const key = req.headers['x-backup-key'];
    if (key && process.env.BACKUP_API_KEY && key === process.env.BACKUP_API_KEY) {
        return next();
    }
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        try {
            const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'nvbestpca-secret');
            if (payload.role === 'admin') return next();
        } catch {}
    }
    return res.status(401).json({ error: 'Invalid backup credentials' });
}
router.get('/backup/export', backupAuth, exportBackup);

// ── All routes below require authentication ──
router.use(authenticate);

// Auth (authenticated)
router.get('/auth/me', getMe);

// Auth — user management (admin only)
router.post('/auth/register', requireRole('admin'), requirePermission('users'), register);
router.get('/auth/users', requireRole('admin', 'user', 'pca'), listUsers);
router.delete('/auth/users/bulk-permanent', requireRole('admin'), requirePermission('users'), bulkPermanentlyDeleteUsers);
router.delete('/auth/users/:id', requireRole('admin'), requirePermission('users'), deleteUser);
router.put('/auth/users/:id/restore', requireRole('admin'), requirePermission('users'), restoreUser);
router.put('/auth/users/:id/reset-password', requireRole('admin'), requirePermission('users'), resetPassword);
router.put('/auth/users/:id/toggle-active', requireRole('admin'), requirePermission('users'), toggleUserActive);
router.delete('/auth/users/:id/permanent', requireRole('admin'), requirePermission('users'), permanentlyDeleteUser);

// Permission groups (admin only)
router.get('/permissions/keys', requireRole('admin'), getPermissionKeys);
router.get('/permission-groups', requireRole('admin'), listPermissionGroups);
router.get('/permission-groups/:id', requireRole('admin'), getPermissionGroup);
router.post('/permission-groups', requireRole('admin'), createPermissionGroup);
router.patch('/permission-groups/:id', requireRole('admin'), updatePermissionGroup);
router.delete('/permission-groups/:id', requireRole('admin'), archivePermissionGroup);
router.patch('/users/:id/permission-group', requireRole('admin'), assignUserPermissionGroup);

// Dashboard
router.get('/dashboard/stats', requireRole('admin', 'user', 'pca'), getDashboardStats);

// Client routes — bulk import is admin only, everything else is admin + user
router.get('/clients', requireRole('admin', 'user', 'pca'), requirePermission('clients'), listClients);
router.get('/clients/archived', requireRole('admin', 'user', 'pca'), requirePermission('clients'), listArchivedClients);
router.post('/clients/restore', requireRole('admin', 'user', 'pca'), requirePermission('clients'), restoreClients);
router.delete('/clients/bulk-permanent', requireRole('admin'), requirePermission('clients'), bulkPermanentlyDeleteClients);
router.get('/clients/:id', requireRole('admin', 'user', 'pca'), requirePermission('clients'), getClient);
router.post('/clients', requireRole('admin', 'user', 'pca'), requirePermission('clients'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), requirePermission('clients'), upload.single('file'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin', 'user', 'pca'), requirePermission('clients'), bulkDelete);
router.put('/clients/:id/restore', requireRole('admin', 'user', 'pca'), requirePermission('clients'), restoreClient);
router.put('/clients/:id', requireRole('admin', 'user', 'pca'), requirePermission('clients'), updateClient);
router.patch('/clients/:id', requireRole('admin', 'user', 'pca'), requirePermission('clients'), patchClient);
router.delete('/clients/:id', requireRole('admin', 'user', 'pca'), requirePermission('clients'), deleteClient);
router.delete('/clients/:id/permanent', requireRole('admin'), requirePermission('clients'), permanentlyDeleteClient);
router.post('/clients/:id/merge', requireRole('admin'), requirePermission('clients'), mergeClients);

// Authorization routes
router.post('/clients/:clientId/authorizations', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), createAuthorization);
router.put('/authorizations/:id', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), updateAuthorization);
router.put('/authorizations/:id/archive', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), archiveAuthorization);
router.put('/authorizations/:id/restore', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), restoreAuthorization);
router.delete('/authorizations/:id', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), deleteAuthorization);
router.patch('/authorizations/:id/account-number', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), updateAccountNumber);
router.patch('/authorizations/:id/sandata-client-id', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), updateSandataClientId);
router.patch('/authorizations/:id/status', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), updateAuthManualStatus);
router.post('/authorizations/:id/renew', requireRole('admin', 'user', 'pca'), requirePermission('authorizations'), renewAuthorization);
router.post('/authorizations/dedup', requireRole('admin'), requirePermission('authorizations'), dedupAuthorizations);

// Care Team
router.post('/clients/:clientId/care-team', requireRole('admin', 'user', 'pca'), addCareTeamMember);
router.delete('/clients/:clientId/care-team/:id', requireRole('admin', 'user', 'pca'), removeCareTeamMember);

// Client Documents
router.post('/clients/:clientId/documents', requireRole('admin', 'user', 'pca'), upload.single('file'), uploadDocument);
router.get('/documents/:id/download', requireRole('admin', 'user', 'pca'), downloadDocument);
router.delete('/documents/:id', requireRole('admin', 'user', 'pca'), deleteDocument);

// Authorization Documents
router.post('/authorizations/:authId/documents', requireRole('admin', 'user', 'pca'), upload.single('file'), uploadAuthDocument);
router.get('/auth-documents/:id/download', requireRole('admin', 'user', 'pca'), downloadAuthDocument);
router.delete('/auth-documents/:id', requireRole('admin', 'user', 'pca'), deleteAuthDocument);

// File Manager (admin + user staff access)
const uploadLarge = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.get('/files/folders', requireRole('admin', 'user'), requirePermission('files'), listFolders);
router.get('/files/search', requireRole('admin', 'user'), requirePermission('files'), searchFiles);
router.get('/files/folders/:id', requireRole('admin', 'user'), requirePermission('files'), getFolder);
router.post('/files/folders', requireRole('admin', 'user'), requirePermission('files'), createFolder);
router.patch('/files/folders/:id', requireRole('admin', 'user'), requirePermission('files'), updateFolder);
router.delete('/files/folders/:id', requireRole('admin', 'user'), requirePermission('files'), deleteFolder);
router.post('/files/folders/:id/restore', requireRole('admin', 'user'), requirePermission('files'), restoreFolder);
router.post('/files/upload', requireRole('admin', 'user'), requirePermission('files'), uploadLarge.single('file'), uploadFile);
router.get('/files/:id/download', requireRole('admin', 'user'), requirePermission('files'), downloadFile);
router.put('/files/:id', requireRole('admin', 'user'), requirePermission('files'), uploadLarge.single('file'), replaceFile);
router.patch('/files/:id', requireRole('admin', 'user'), requirePermission('files'), updateFile);
router.delete('/files/:id', requireRole('admin', 'user'), requirePermission('files'), deleteFile);
router.post('/files/copy', requireRole('admin', 'user'), requirePermission('files'), copyFile);
router.get('/files/export', requireRole('admin', 'user'), requirePermission('files'), exportFiles);

// Hospital Visits
router.get('/clients/:clientId/hospital-visits', requireRole('admin', 'user', 'pca'), listHospitalVisits);
router.post('/clients/:clientId/hospital-visits', requireRole('admin', 'user', 'pca'), createHospitalVisit);
router.put('/hospital-visits/:id', requireRole('admin', 'user', 'pca'), updateHospitalVisit);
router.delete('/hospital-visits/:id', requireRole('admin', 'user', 'pca'), deleteHospitalVisit);

// Incidents
router.get('/clients/:clientId/incidents', requireRole('admin', 'user', 'pca'), listIncidents);
router.post('/clients/:clientId/incidents', requireRole('admin', 'user', 'pca'), createIncident);
router.put('/incidents/:id', requireRole('admin', 'user', 'pca'), updateIncident);
router.delete('/incidents/:id', requireRole('admin', 'user', 'pca'), deleteIncident);

// Insurance Type routes
router.get('/insurance-types', requireRole('admin', 'user', 'pca'), requirePermission('insurance-types'), listInsuranceTypes);
router.post('/insurance-types', requireRole('admin', 'user', 'pca'), requirePermission('insurance-types'), createInsuranceType);
router.delete('/insurance-types/bulk-permanent', requireRole('admin'), requirePermission('insurance-types'), bulkPermanentlyDeleteInsuranceTypes);
router.put('/insurance-types/:id/restore', requireRole('admin', 'user', 'pca'), requirePermission('insurance-types'), restoreInsuranceType);
router.put('/insurance-types/:id', requireRole('admin', 'user', 'pca'), requirePermission('insurance-types'), updateInsuranceType);
router.delete('/insurance-types/:id', requireRole('admin', 'user', 'pca'), requirePermission('insurance-types'), deleteInsuranceType);
router.delete('/insurance-types/:id/permanent', requireRole('admin'), requirePermission('insurance-types'), permanentlyDeleteInsuranceType);

// Service routes
router.get('/services', requireRole('admin', 'user', 'pca'), requirePermission('services'), listServices);
router.post('/services', requireRole('admin', 'user', 'pca'), requirePermission('services'), createService);
router.delete('/services/bulk-permanent', requireRole('admin'), requirePermission('services'), bulkPermanentlyDeleteServices);
router.put('/services/:id/restore', requireRole('admin', 'user', 'pca'), requirePermission('services'), restoreService);
router.put('/services/:id', requireRole('admin', 'user', 'pca'), requirePermission('services'), updateService);
router.delete('/services/:id', requireRole('admin', 'user', 'pca'), requirePermission('services'), deleteService);
router.delete('/services/:id/permanent', requireRole('admin'), requirePermission('services'), permanentlyDeleteService);

// Timesheet routes (all authenticated users)
router.get('/timesheets/activities', requirePermission('timesheets'), getActivities);
router.get('/timesheets', requirePermission('timesheets'), listTimesheets);
router.delete('/timesheets/bulk-permanent', requireRole('admin'), requirePermission('timesheets'), bulkPermanentlyDeleteTimesheets);
router.post('/timesheets/send-reminders', requireRole('admin'), requirePermission('timesheets'), sendTimesheetReminders);
router.post('/timesheets/bulk-export-pdf', requireRole('admin', 'user', 'pca'), requirePermission('timesheets'), exportBulkTimesheetPdf);
router.get('/timesheets/:id', requirePermission('timesheets'), getTimesheet);
router.post('/timesheets', requirePermission('timesheets'), createTimesheet);
router.put('/timesheets/:id/restore', requireRole('admin'), requirePermission('timesheets'), restoreTimesheet);
router.put('/timesheets/:id', requireRole('admin'), requirePermission('timesheets'), updateTimesheet);
router.put('/timesheets/:id/submit', requireRole('admin'), requirePermission('timesheets'), submitTimesheet);
router.post('/timesheets/:id/signing-links', requireRole('admin', 'user', 'pca'), requirePermission('timesheets'), generateSigningLinks);
router.delete('/timesheets/:id', requireRole('admin'), requirePermission('timesheets'), deleteTimesheet);
router.delete('/timesheets/:id/permanent', requireRole('admin'), requirePermission('timesheets'), permanentlyDeleteTimesheet);
router.get('/timesheets/:id/export-pdf', requireRole('admin', 'user', 'pca'), requirePermission('timesheets'), exportTimesheetPdf);
router.put('/timesheets/:id/status', requireRole('admin', 'user', 'pca'), requirePermission('timesheets'), updateTimesheetStatus);

// Permanent link routes
router.get('/permanent-links', requireRole('admin', 'user', 'pca'), requirePermission('permanent-links'), listPermanentLinks);
router.post('/permanent-links', requireRole('admin', 'user', 'pca'), requirePermission('permanent-links'), createPermanentLink);
router.delete('/permanent-links/:id', requireRole('admin', 'user', 'pca'), requirePermission('permanent-links'), deletePermanentLink);

// Payroll
router.get('/payroll/runs',                requireRole('admin', 'user', 'pca'), requirePermission('payroll'), listPayrollRuns);
router.post('/payroll/runs',               requireRole('admin'), requirePermission('payroll'), upload.single('file'), uploadPayrollRun);
router.delete('/payroll/runs/bulk-permanent', requireRole('admin'), requirePermission('payroll'), bulkPermanentlyDeletePayrollRuns);
router.get('/payroll/runs/:id',            requireRole('admin', 'user', 'pca'), requirePermission('payroll'), getPayrollRun);
router.patch('/payroll/runs/:id',          requireRole('admin'), requirePermission('payroll'), updatePayrollRun);
router.put('/payroll/runs/:id/restore',    requireRole('admin'), requirePermission('payroll'), restorePayrollRun);
router.delete('/payroll/runs/:id',         requireRole('admin'), requirePermission('payroll'), deletePayrollRun);
router.delete('/payroll/runs/:id/permanent', requireRole('admin'), requirePermission('payroll'), permanentlyDeletePayrollRun);
router.get('/payroll/runs/:id/export',     requireRole('admin', 'user', 'pca'), requirePermission('payroll'), exportPayrollRun);
router.patch('/payroll/visits/:id',        requireRole('admin'), requirePermission('payroll'), updatePayrollVisit);
router.patch('/payroll/visits/:id/notes',  requireRole('admin', 'user', 'pca'), requirePermission('payroll'), updatePayrollVisitNotes);

// Employees
router.get('/employees',       requireRole('admin', 'user', 'pca'), requirePermission('employees'), listEmployees);
router.get('/employees/archived', requireRole('admin', 'user', 'pca'), requirePermission('employees'), listArchivedEmployees);
router.post('/employees/restore', requireRole('admin', 'user', 'pca'), requirePermission('employees'), restoreEmployees);
router.delete('/employees/bulk-permanent', requireRole('admin'), requirePermission('employees'), bulkPermanentlyDeleteEmployees);
router.get('/employees/:id',   requireRole('admin', 'user', 'pca'), requirePermission('employees'), getEmployee);
router.post('/employees',      requireRole('admin', 'user', 'pca'), requirePermission('employees'), createEmployee);
router.post('/employees/bulk-import', requireRole('admin'), requirePermission('employees'), upload.single('file'), bulkImportEmployees);
router.put('/employees/:id/restore', requireRole('admin', 'user', 'pca'), requirePermission('employees'), restoreEmployee);
router.put('/employees/:id',   requireRole('admin', 'user', 'pca'), requirePermission('employees'), updateEmployee);
router.delete('/employees/:id', requireRole('admin', 'user', 'pca'), requirePermission('employees'), deleteEmployee);
router.delete('/employees/:id/permanent', requireRole('admin'), requirePermission('employees'), permanentlyDeleteEmployee);
router.post('/employees/:id/resend-invite', requireRole('admin'), requirePermission('employees'), resendInvite);
router.patch('/employees/:id/approve-onboarding', requireRole('admin'), requirePermission('employees'), approveOnboarding);
router.get('/employees/:id/onboarding-link', requireRole('admin'), requirePermission('employees'), getOnboardingLink);
router.get('/employees/:id/availability', requireRole('admin', 'user', 'pca'), requirePermission('employees'), getEmployeeAvailability);

// Employee Certifications
router.get('/employees/:employeeId/certifications', requireRole('admin', 'user', 'pca'), requirePermission('employees'), listCertifications);
router.post('/employees/:employeeId/certifications', requireRole('admin', 'user', 'pca'), requirePermission('employees'), upload.single('file'), createCertification);
router.put('/certifications/:id', requireRole('admin', 'user', 'pca'), requirePermission('employees'), upload.single('file'), updateCertification);
router.delete('/certifications/:id', requireRole('admin', 'user', 'pca'), requirePermission('employees'), deleteCertification);
router.get('/certifications/:id/download', requireRole('admin', 'user', 'pca'), requirePermission('employees'), downloadCertification);

// Scheduling
router.get('/shifts',                       requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), listShifts);
router.get('/shifts/auth-check',            requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), authCheck);
router.get('/shifts/client/:clientId',      requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), getClientSchedule);
router.get('/shifts/employee/:employeeId',  requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), getEmployeeSchedule);
router.post('/shifts',                      requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), createShift);
router.patch('/shifts/bulk',                requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), bulkUpdateShifts);
router.patch('/shifts/bulk-per-shift',      requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), bulkUpdateShiftsPerShift);
router.delete('/shifts/bulk',               requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), bulkDeleteShifts);
router.get('/shifts/bulk-edit-batches',      requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), listBulkEditBatches);
router.post('/shifts/bulk-undo/:batchId',   requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), bulkUndoBatch);
router.post('/shifts/:id/repeat',            requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), repeatShift);
router.put('/shifts/:id/restore',           requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), restoreShift);
router.post('/shifts/restore',              requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), restoreShifts);
router.delete('/shifts/permanent',          requireRole('admin'), requirePermission('scheduling'), permanentDeleteShifts);
router.get('/shifts/archived',              requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), listArchivedShifts);
router.put('/shifts/:id',                   requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), updateShift);
router.delete('/shifts/all',                requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), deleteAllShifts);
router.delete('/shifts/:id',                requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), deleteShift);

// Schedule Notifications
router.post('/schedule-notifications/send',       requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), sendSchedules);
router.get('/schedule-notifications/status',      requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), getNotificationStatus);
router.get('/schedule-notifications/responses',   requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), getScheduleResponses);
router.get('/schedule-notifications/employee/:employeeId', requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), getEmployeeNotificationHistory);

// Employee Schedule Links
router.get('/employee-schedule-links',        requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), listLinks);
router.post('/employee-schedule-links',       requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), createLink);
router.delete('/employee-schedule-links/:id', requireRole('admin', 'user', 'pca'), requirePermission('scheduling'), deleteLink);

// Client Activities
router.get('/clients/:clientId/activities', listActivities);
router.post('/clients/:clientId/activities', createActivity);
router.delete('/activities/:id', requireRole('admin'), deleteActivity);

// Audit Logs (admin only)
router.get('/audit-logs',                     requireRole('admin'), requirePermission('history'), getAuditLogs);
router.get('/audit-logs/:entityType/:entityId', requireRole('admin'), requirePermission('history'), getEntityAuditLogs);

// Tasks
router.get('/tasks/summary', requireRole('admin', 'user', 'pca'), requirePermission('tasks'), getTaskSummary);
router.get('/tasks', requireRole('admin', 'user', 'pca'), requirePermission('tasks'), listTasks);
router.patch('/tasks/bulk-update', requireRole('admin'), requirePermission('tasks'), bulkUpdateTasks);
router.get('/tasks/:id', requireRole('admin', 'user', 'pca'), requirePermission('tasks'), getTask);
router.post('/tasks', requireRole('admin'), requirePermission('tasks'), createTask);
router.patch('/tasks/:id', requireRole('admin', 'user', 'pca'), requirePermission('tasks'), updateTask);
router.delete('/tasks/:id', requireRole('admin'), requirePermission('tasks'), deleteTask);

// Workflow Triggers (admin only)
router.get('/workflow-triggers', requireRole('admin'), listWorkflowTriggers);
router.patch('/workflow-triggers/:id', requireRole('admin'), updateWorkflowTrigger);

// Payroll Profiles (admin-only)
router.get('/employees/:employeeId/payroll-profile', requireRole('admin'), getPayrollProfile);
router.put('/employees/:employeeId/payroll-profile', requireRole('admin'), upsertPayrollProfile);
router.get('/employees/:employeeId/payroll-profile/reveal', requireRole('admin'), revealSensitiveField);

// Receipts (admin-only)
router.get('/receipts', requireRole('admin'), requirePermission('receipts'), listReceipts);
router.post('/receipts/preview', requireRole('admin'), requirePermission('receipts'), previewReceipts);
router.post('/receipts/generate', requireRole('admin'), requirePermission('receipts'), generateReceipts);
router.patch('/receipts/:id', requireRole('admin'), requirePermission('receipts'), updateReceipt);
router.post('/receipts/finalize', requireRole('admin'), requirePermission('receipts'), finalizeReceipts);
router.post('/receipts/send', requireRole('admin'), requirePermission('receipts'), sendReceipts);
router.get('/receipts/:id/pdf', requireRole('admin'), requirePermission('receipts'), downloadReceiptPdf);

// SANDATA Import (admin only)
router.post('/sandata/preview', requireRole('admin'), requirePermission('sandata'), upload.single('file'), previewSandata);
router.post('/sandata/apply', requireRole('admin'), requirePermission('sandata'), applySandata);
router.post('/sandata/undo', requireRole('admin'), requirePermission('sandata'), undoSandata);

// Employee chat (admin)
router.get('/conversations', requireRole('admin', 'user'), requirePermission('messages'), listConversations);
router.get('/conversations/unread-summary', requireRole('admin', 'user'), requirePermission('messages'), getUnreadSummary);
router.get('/conversations/:id/messages', requireRole('admin', 'user'), requirePermission('messages'), getConversationMessages);
router.post('/conversations/:id/messages', requireRole('admin', 'user'), requirePermission('messages'), adminSendMessage);
router.post('/conversations/:id/read', requireRole('admin', 'user'), requirePermission('messages'), markConversationRead);

module.exports = router;
