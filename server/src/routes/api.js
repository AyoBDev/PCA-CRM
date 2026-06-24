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
const { authenticate, requireRole } = require('../middleware/authMiddleware');
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
router.post('/auth/register', requireRole('admin'), register);
router.get('/auth/users', requireRole('admin', 'user', 'pca'), listUsers);
router.delete('/auth/users/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteUsers);
router.delete('/auth/users/:id', requireRole('admin'), deleteUser);
router.put('/auth/users/:id/restore', requireRole('admin'), restoreUser);
router.put('/auth/users/:id/reset-password', requireRole('admin'), resetPassword);
router.put('/auth/users/:id/toggle-active', requireRole('admin'), toggleUserActive);
router.delete('/auth/users/:id/permanent', requireRole('admin'), permanentlyDeleteUser);

// Dashboard
router.get('/dashboard/stats', requireRole('admin', 'user', 'pca'), getDashboardStats);

// Client routes — bulk import is admin only, everything else is admin + user
router.get('/clients', requireRole('admin', 'user', 'pca'), listClients);
router.get('/clients/archived', requireRole('admin', 'user', 'pca'), listArchivedClients);
router.post('/clients/restore', requireRole('admin', 'user', 'pca'), restoreClients);
router.delete('/clients/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteClients);
router.get('/clients/:id', requireRole('admin', 'user', 'pca'), getClient);
router.post('/clients', requireRole('admin', 'user', 'pca'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), upload.single('file'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin', 'user', 'pca'), bulkDelete);
router.put('/clients/:id/restore', requireRole('admin', 'user', 'pca'), restoreClient);
router.put('/clients/:id', requireRole('admin', 'user', 'pca'), updateClient);
router.patch('/clients/:id', requireRole('admin', 'user', 'pca'), patchClient);
router.delete('/clients/:id', requireRole('admin', 'user', 'pca'), deleteClient);
router.delete('/clients/:id/permanent', requireRole('admin'), permanentlyDeleteClient);
router.post('/clients/:id/merge', requireRole('admin'), mergeClients);

// Authorization routes
router.post('/clients/:clientId/authorizations', requireRole('admin', 'user', 'pca'), createAuthorization);
router.put('/authorizations/:id', requireRole('admin', 'user', 'pca'), updateAuthorization);
router.put('/authorizations/:id/archive', requireRole('admin', 'user', 'pca'), archiveAuthorization);
router.put('/authorizations/:id/restore', requireRole('admin', 'user', 'pca'), restoreAuthorization);
router.delete('/authorizations/:id', requireRole('admin', 'user', 'pca'), deleteAuthorization);
router.patch('/authorizations/:id/account-number', requireRole('admin', 'user', 'pca'), updateAccountNumber);
router.patch('/authorizations/:id/sandata-client-id', requireRole('admin', 'user', 'pca'), updateSandataClientId);
router.patch('/authorizations/:id/status', requireRole('admin', 'user', 'pca'), updateAuthManualStatus);
router.post('/authorizations/:id/renew', requireRole('admin', 'user', 'pca'), renewAuthorization);
router.post('/authorizations/dedup', requireRole('admin'), dedupAuthorizations);

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

// Admin File Manager
const uploadLarge = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.get('/files/folders', requireRole('admin'), listFolders);
router.get('/files/search', requireRole('admin'), searchFiles);
router.get('/files/folders/:id', requireRole('admin'), getFolder);
router.post('/files/folders', requireRole('admin'), createFolder);
router.patch('/files/folders/:id', requireRole('admin'), updateFolder);
router.delete('/files/folders/:id', requireRole('admin'), deleteFolder);
router.post('/files/folders/:id/restore', requireRole('admin'), restoreFolder);
router.post('/files/upload', requireRole('admin'), uploadLarge.single('file'), uploadFile);
router.get('/files/:id/download', requireRole('admin'), downloadFile);
router.put('/files/:id', requireRole('admin'), uploadLarge.single('file'), replaceFile);
router.patch('/files/:id', requireRole('admin'), updateFile);
router.delete('/files/:id', requireRole('admin'), deleteFile);
router.post('/files/copy', requireRole('admin'), copyFile);
router.get('/files/export', requireRole('admin'), exportFiles);

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
router.get('/insurance-types', requireRole('admin', 'user', 'pca'), listInsuranceTypes);
router.post('/insurance-types', requireRole('admin', 'user', 'pca'), createInsuranceType);
router.delete('/insurance-types/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteInsuranceTypes);
router.put('/insurance-types/:id/restore', requireRole('admin', 'user', 'pca'), restoreInsuranceType);
router.put('/insurance-types/:id', requireRole('admin', 'user', 'pca'), updateInsuranceType);
router.delete('/insurance-types/:id', requireRole('admin', 'user', 'pca'), deleteInsuranceType);
router.delete('/insurance-types/:id/permanent', requireRole('admin'), permanentlyDeleteInsuranceType);

// Service routes
router.get('/services', requireRole('admin', 'user', 'pca'), listServices);
router.post('/services', requireRole('admin', 'user', 'pca'), createService);
router.delete('/services/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteServices);
router.put('/services/:id/restore', requireRole('admin', 'user', 'pca'), restoreService);
router.put('/services/:id', requireRole('admin', 'user', 'pca'), updateService);
router.delete('/services/:id', requireRole('admin', 'user', 'pca'), deleteService);
router.delete('/services/:id/permanent', requireRole('admin'), permanentlyDeleteService);

// Timesheet routes (all authenticated users)
router.get('/timesheets/activities', getActivities);
router.get('/timesheets', listTimesheets);
router.delete('/timesheets/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteTimesheets);
router.post('/timesheets/send-reminders', requireRole('admin'), sendTimesheetReminders);
router.post('/timesheets/bulk-export-pdf', requireRole('admin', 'user', 'pca'), exportBulkTimesheetPdf);
router.get('/timesheets/:id', getTimesheet);
router.post('/timesheets', createTimesheet);
router.put('/timesheets/:id/restore', requireRole('admin'), restoreTimesheet);
router.put('/timesheets/:id', requireRole('admin'), updateTimesheet);
router.put('/timesheets/:id/submit', requireRole('admin'), submitTimesheet);
router.post('/timesheets/:id/signing-links', requireRole('admin', 'user', 'pca'), generateSigningLinks);
router.delete('/timesheets/:id', requireRole('admin'), deleteTimesheet);
router.delete('/timesheets/:id/permanent', requireRole('admin'), permanentlyDeleteTimesheet);
router.get('/timesheets/:id/export-pdf', requireRole('admin', 'user', 'pca'), exportTimesheetPdf);
router.put('/timesheets/:id/status', requireRole('admin', 'user', 'pca'), updateTimesheetStatus);

// Permanent link routes
router.get('/permanent-links', requireRole('admin', 'user', 'pca'), listPermanentLinks);
router.post('/permanent-links', requireRole('admin', 'user', 'pca'), createPermanentLink);
router.delete('/permanent-links/:id', requireRole('admin', 'user', 'pca'), deletePermanentLink);

// Payroll
router.get('/payroll/runs',                requireRole('admin', 'user', 'pca'), listPayrollRuns);
router.post('/payroll/runs',               requireRole('admin'), upload.single('file'), uploadPayrollRun);
router.delete('/payroll/runs/bulk-permanent', requireRole('admin'), bulkPermanentlyDeletePayrollRuns);
router.get('/payroll/runs/:id',            requireRole('admin', 'user', 'pca'), getPayrollRun);
router.patch('/payroll/runs/:id',          requireRole('admin'), updatePayrollRun);
router.put('/payroll/runs/:id/restore',    requireRole('admin'), restorePayrollRun);
router.delete('/payroll/runs/:id',         requireRole('admin'), deletePayrollRun);
router.delete('/payroll/runs/:id/permanent', requireRole('admin'), permanentlyDeletePayrollRun);
router.get('/payroll/runs/:id/export',     requireRole('admin', 'user', 'pca'), exportPayrollRun);
router.patch('/payroll/visits/:id',        requireRole('admin'), updatePayrollVisit);
router.patch('/payroll/visits/:id/notes',  requireRole('admin', 'user', 'pca'), updatePayrollVisitNotes);

// Employees
router.get('/employees',       requireRole('admin', 'user', 'pca'), listEmployees);
router.get('/employees/archived', requireRole('admin', 'user', 'pca'), listArchivedEmployees);
router.post('/employees/restore', requireRole('admin', 'user', 'pca'), restoreEmployees);
router.delete('/employees/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteEmployees);
router.get('/employees/:id',   requireRole('admin', 'user', 'pca'), getEmployee);
router.post('/employees',      requireRole('admin', 'user', 'pca'), createEmployee);
router.post('/employees/bulk-import', requireRole('admin'), upload.single('file'), bulkImportEmployees);
router.put('/employees/:id/restore', requireRole('admin', 'user', 'pca'), restoreEmployee);
router.put('/employees/:id',   requireRole('admin', 'user', 'pca'), updateEmployee);
router.delete('/employees/:id', requireRole('admin', 'user', 'pca'), deleteEmployee);
router.delete('/employees/:id/permanent', requireRole('admin'), permanentlyDeleteEmployee);
router.post('/employees/:id/resend-invite', requireRole('admin'), resendInvite);
router.patch('/employees/:id/approve-onboarding', requireRole('admin'), approveOnboarding);
router.get('/employees/:id/onboarding-link', requireRole('admin'), getOnboardingLink);
router.get('/employees/:id/availability', requireRole('admin', 'user', 'pca'), getEmployeeAvailability);

// Employee Certifications
router.get('/employees/:employeeId/certifications', requireRole('admin', 'user', 'pca'), listCertifications);
router.post('/employees/:employeeId/certifications', requireRole('admin', 'user', 'pca'), upload.single('file'), createCertification);
router.put('/certifications/:id', requireRole('admin', 'user', 'pca'), upload.single('file'), updateCertification);
router.delete('/certifications/:id', requireRole('admin', 'user', 'pca'), deleteCertification);
router.get('/certifications/:id/download', requireRole('admin', 'user', 'pca'), downloadCertification);

// Scheduling
router.get('/shifts',                       requireRole('admin', 'user', 'pca'), listShifts);
router.get('/shifts/auth-check',            requireRole('admin', 'user', 'pca'), authCheck);
router.get('/shifts/client/:clientId',      requireRole('admin', 'user', 'pca'), getClientSchedule);
router.get('/shifts/employee/:employeeId',  requireRole('admin', 'user', 'pca'), getEmployeeSchedule);
router.post('/shifts',                      requireRole('admin', 'user', 'pca'), createShift);
router.patch('/shifts/bulk',                requireRole('admin', 'user', 'pca'), bulkUpdateShifts);
router.patch('/shifts/bulk-per-shift',      requireRole('admin', 'user', 'pca'), bulkUpdateShiftsPerShift);
router.delete('/shifts/bulk',               requireRole('admin', 'user', 'pca'), bulkDeleteShifts);
router.get('/shifts/bulk-edit-batches',      requireRole('admin', 'user', 'pca'), listBulkEditBatches);
router.post('/shifts/bulk-undo/:batchId',   requireRole('admin', 'user', 'pca'), bulkUndoBatch);
router.post('/shifts/:id/repeat',            requireRole('admin', 'user', 'pca'), repeatShift);
router.put('/shifts/:id/restore',           requireRole('admin', 'user', 'pca'), restoreShift);
router.post('/shifts/restore',              requireRole('admin', 'user', 'pca'), restoreShifts);
router.delete('/shifts/permanent',          requireRole('admin'), permanentDeleteShifts);
router.get('/shifts/archived',              requireRole('admin', 'user', 'pca'), listArchivedShifts);
router.put('/shifts/:id',                   requireRole('admin', 'user', 'pca'), updateShift);
router.delete('/shifts/all',                requireRole('admin', 'user', 'pca'), deleteAllShifts);
router.delete('/shifts/:id',                requireRole('admin', 'user', 'pca'), deleteShift);

// Schedule Notifications
router.post('/schedule-notifications/send',       requireRole('admin', 'user', 'pca'), sendSchedules);
router.get('/schedule-notifications/status',      requireRole('admin', 'user', 'pca'), getNotificationStatus);
router.get('/schedule-notifications/responses',   requireRole('admin', 'user', 'pca'), getScheduleResponses);
router.get('/schedule-notifications/employee/:employeeId', requireRole('admin', 'user', 'pca'), getEmployeeNotificationHistory);

// Employee Schedule Links
router.get('/employee-schedule-links',        requireRole('admin', 'user', 'pca'), listLinks);
router.post('/employee-schedule-links',       requireRole('admin', 'user', 'pca'), createLink);
router.delete('/employee-schedule-links/:id', requireRole('admin', 'user', 'pca'), deleteLink);

// Client Activities
router.get('/clients/:clientId/activities', listActivities);
router.post('/clients/:clientId/activities', createActivity);
router.delete('/activities/:id', requireRole('admin'), deleteActivity);

// Audit Logs (admin only)
router.get('/audit-logs',                     requireRole('admin'), getAuditLogs);
router.get('/audit-logs/:entityType/:entityId', requireRole('admin'), getEntityAuditLogs);

// Tasks
router.get('/tasks/summary', requireRole('admin', 'user', 'pca'), getTaskSummary);
router.get('/tasks', requireRole('admin', 'user', 'pca'), listTasks);
router.patch('/tasks/bulk-update', requireRole('admin'), bulkUpdateTasks);
router.get('/tasks/:id', requireRole('admin', 'user', 'pca'), getTask);
router.post('/tasks', requireRole('admin'), createTask);
router.patch('/tasks/:id', requireRole('admin', 'user', 'pca'), updateTask);
router.delete('/tasks/:id', requireRole('admin'), deleteTask);

// Workflow Triggers (admin only)
router.get('/workflow-triggers', requireRole('admin'), listWorkflowTriggers);
router.patch('/workflow-triggers/:id', requireRole('admin'), updateWorkflowTrigger);

// Payroll Profiles (admin-only)
router.get('/employees/:employeeId/payroll-profile', requireRole('admin'), getPayrollProfile);
router.put('/employees/:employeeId/payroll-profile', requireRole('admin'), upsertPayrollProfile);
router.get('/employees/:employeeId/payroll-profile/reveal', requireRole('admin'), revealSensitiveField);

// Receipts (admin-only)
router.get('/receipts', requireRole('admin'), listReceipts);
router.post('/receipts/preview', requireRole('admin'), previewReceipts);
router.post('/receipts/generate', requireRole('admin'), generateReceipts);
router.patch('/receipts/:id', requireRole('admin'), updateReceipt);
router.post('/receipts/finalize', requireRole('admin'), finalizeReceipts);
router.post('/receipts/send', requireRole('admin'), sendReceipts);
router.get('/receipts/:id/pdf', requireRole('admin'), downloadReceiptPdf);

// SANDATA Import (admin only)
router.post('/sandata/preview', requireRole('admin'), upload.single('file'), previewSandata);
router.post('/sandata/apply', requireRole('admin'), applySandata);
router.post('/sandata/undo', requireRole('admin'), undoSandata);

// Employee chat (admin)
router.get('/conversations', requireRole('admin', 'user'), listConversations);
router.get('/conversations/unread-summary', requireRole('admin', 'user'), getUnreadSummary);
router.get('/conversations/:id/messages', requireRole('admin', 'user'), getConversationMessages);
router.post('/conversations/:id/messages', requireRole('admin', 'user'), adminSendMessage);
router.post('/conversations/:id/read', requireRole('admin', 'user'), markConversationRead);

module.exports = router;
