const express = require('express');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
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
    inactivateAuthorization,
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
    recordCallout,
    getReplacementCandidates,
    getNearbyEmployees,
    getOffer,
    respondToOffer,
    createOffer,
    startAutoOffer,
    listOffers,
    recordOfferResponse,
    resolveCallout: resolveCalloutRoute,
} = require('../controllers/replacementController');
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
const { listCertifications, createCertification, updateCertification, deleteCertification, downloadCertification, downloadCertificationUpload } = require('../controllers/employeeCertController');
const { getEmployeeAttention, markAttentionSeen } = require('../controllers/adminEmployeeAttentionController');
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
const { listLeadDocuments, uploadLeadDocument, downloadLeadDocument, deleteLeadDocument } = require('../controllers/leadDocumentController');
const { uploadAuthDocument, downloadAuthDocument, deleteAuthDocument } = require('../controllers/authDocumentController');
const {
    listFolders, getFolder, createFolder, updateFolder, deleteFolder, restoreFolder,
    uploadFile, downloadFile, replaceFile, updateFile, deleteFile, copyFile, searchFiles, exportFiles,
} = require('../controllers/fileManagerController');
const { listActivities, createActivity, deleteActivity } = require('../controllers/activityController');
const { listNotesTimeline, exportClientNotesPdf } = require('../controllers/clientNotesController');
const { listEmployeeNotesTimeline, exportEmployeeNotesPdf } = require('../controllers/employeeNotesController');
const { listTasks, getTask, createTask, updateTask, deleteTask, bulkUpdateTasks, getTaskSummary } = require('../controllers/taskController');
const { listWorkflowTriggers, updateWorkflowTrigger } = require('../controllers/workflowTriggerController');
const { getPayrollProfile, upsertPayrollProfile, revealSensitiveField } = require('../controllers/payrollProfileController');
const { listReceipts, previewReceipts, generateReceipts, updateReceipt, finalizeReceipts, sendReceipts, downloadReceiptPdf } = require('../controllers/receiptController');
const { previewSandata, applySandata, undoSandata } = require('../controllers/sandataController');
const { listConversations, getConversationMessages, adminSendMessage, markConversationRead, getUnreadSummary } = require('../controllers/employeePortal/adminChatController');
const { getOnboardingInfo, completeOnboarding, resendInvite, approveOnboarding, getOnboardingLink } = require('../controllers/onboardingController');
const { agencyInfo, hostInfo } = require('../controllers/platformController');
const { listLeads, getLead, createLead, updateLead, setLeadStatus, archiveLead, restoreLead, convertLead, revertConversion, reactivateLead, getLeadStats } = require('../controllers/leadController');
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
const rateLimit = require('express-rate-limit');
const employeeRoutes = require('./employee');

const router = express.Router();

// Throttle credential-guessing on the unauthenticated auth endpoints.
// 10 attempts per IP per 15 min; only failed responses count toward the limit
// so a legitimate user who logs in successfully is never blocked.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

// ── Employee Portal routes (own auth middleware) ──
router.use('/employee', employeeRoutes);

// ── Public routes (no auth) ──
router.post('/auth/login', authLimiter, login);
router.post('/auth/employee-login', authLimiter, employeeLogin);
router.post('/auth/forgot-password', authLimiter, forgotPassword);
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
router.get('/shift-offers/:token', getOffer);
router.post('/shift-offers/:token/respond', respondToOffer);
router.get('/onboarding/:token', getOnboardingInfo);
router.post('/onboarding/:token/complete', completeOnboarding);
router.get('/agency-info', agencyInfo);
router.get('/host-info', hostInfo);

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
            const payload = jwt.verify(header.slice(7), require('../config/secrets').JWT_SECRET);
            if (
                payload.role === 'admin' &&
                Number.isInteger(payload.agencyId) &&
                req.agency &&
                payload.agencyId === req.agency.id
            ) {
                return next();
            }
        } catch {}
    }
    return res.status(401).json({ error: 'Invalid backup credentials' });
}
router.get('/backup/export', backupAuth, exportBackup);

// ── All routes below require authentication ──
router.use(authenticate);

// Platform console (superadmin only) — runs after authenticate but before
// tenantMiddleware since superadmin accounts have no agencyId.
router.use('/platform', require('./platform'));

router.use(tenantMiddleware);

// Auth (authenticated)
router.get('/auth/me', getMe);

// Auth — user management (admin only)
router.post('/auth/register', requireRole('admin'), requirePermission('users'), register);
router.get('/auth/users', requireRole('admin', 'user'), listUsers);
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
router.get('/dashboard/stats', requireRole('admin', 'user'), getDashboardStats);

// Client routes — bulk import is admin only, everything else is admin + user
router.get('/clients', requireRole('admin', 'user'), requirePermission('clients'), listClients);
router.get('/clients/archived', requireRole('admin', 'user'), requirePermission('clients'), listArchivedClients);
router.post('/clients/restore', requireRole('admin', 'user'), requirePermission('clients'), restoreClients);
router.delete('/clients/bulk-permanent', requireRole('admin'), requirePermission('clients'), bulkPermanentlyDeleteClients);
router.get('/clients/:id', requireRole('admin', 'user'), requirePermission('clients'), getClient);
router.post('/clients', requireRole('admin', 'user'), requirePermission('clients'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), requirePermission('clients'), upload.single('file'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin', 'user'), requirePermission('clients'), bulkDelete);
router.put('/clients/:id/restore', requireRole('admin', 'user'), requirePermission('clients'), restoreClient);
router.put('/clients/:id', requireRole('admin', 'user'), requirePermission('clients'), updateClient);
router.patch('/clients/:id', requireRole('admin', 'user'), requirePermission('clients'), patchClient);
router.delete('/clients/:id', requireRole('admin', 'user'), requirePermission('clients'), deleteClient);
router.delete('/clients/:id/permanent', requireRole('admin'), requirePermission('clients'), permanentlyDeleteClient);
router.post('/clients/:id/merge', requireRole('admin'), requirePermission('clients'), mergeClients);

// Lead routes (place /leads/stats BEFORE /leads/:id so 'stats' isn't captured as an id)
router.get('/leads/stats', requireRole('admin', 'user'), requirePermission('leads'), getLeadStats);
router.get('/leads', requireRole('admin', 'user'), requirePermission('leads'), listLeads);
router.post('/leads', requireRole('admin', 'user'), requirePermission('leads'), createLead);
router.get('/leads/:id', requireRole('admin', 'user'), requirePermission('leads'), getLead);
router.put('/leads/:id', requireRole('admin', 'user'), requirePermission('leads'), updateLead);
router.patch('/leads/:id/status', requireRole('admin', 'user'), requirePermission('leads'), setLeadStatus);
router.post('/leads/:id/archive', requireRole('admin', 'user'), requirePermission('leads'), archiveLead);
router.post('/leads/:id/restore', requireRole('admin', 'user'), requirePermission('leads'), restoreLead);
router.post('/leads/:id/convert', requireRole('admin', 'user'), requirePermission('leads'), convertLead);
router.post('/leads/:id/revert-conversion', requireRole('admin', 'user'), requirePermission('leads'), revertConversion);
router.post('/leads/:id/reactivate', requireRole('admin', 'user'), requirePermission('leads'), reactivateLead);
// Lead attachments (images / PDFs / docs)
router.get('/leads/:leadId/documents', requireRole('admin', 'user'), requirePermission('leads'), listLeadDocuments);
router.post('/leads/:leadId/documents', requireRole('admin', 'user'), requirePermission('leads'), upload.single('file'), uploadLeadDocument);
router.get('/lead-documents/:id/download', requireRole('admin', 'user'), requirePermission('leads'), downloadLeadDocument);
router.delete('/lead-documents/:id', requireRole('admin', 'user'), requirePermission('leads'), deleteLeadDocument);

// Authorization routes
router.post('/clients/:clientId/authorizations', requireRole('admin', 'user'), requirePermission('authorizations'), createAuthorization);
router.put('/authorizations/:id', requireRole('admin', 'user'), requirePermission('authorizations'), updateAuthorization);
router.put('/authorizations/:id/archive', requireRole('admin', 'user'), requirePermission('authorizations'), archiveAuthorization);
router.put('/authorizations/:id/restore', requireRole('admin', 'user'), requirePermission('authorizations'), restoreAuthorization);
router.delete('/authorizations/:id', requireRole('admin', 'user'), requirePermission('authorizations'), deleteAuthorization);
router.patch('/authorizations/:id/account-number', requireRole('admin', 'user'), requirePermission('authorizations'), updateAccountNumber);
router.patch('/authorizations/:id/sandata-client-id', requireRole('admin', 'user'), requirePermission('authorizations'), updateSandataClientId);
router.patch('/authorizations/:id/status', requireRole('admin', 'user'), requirePermission('authorizations'), updateAuthManualStatus);
router.post('/authorizations/:id/renew', requireRole('admin', 'user'), requirePermission('authorizations'), renewAuthorization);
router.patch('/authorizations/:id/inactivate', requireRole('admin', 'user'), requirePermission('authorizations'), inactivateAuthorization);
router.post('/authorizations/dedup', requireRole('admin'), requirePermission('authorizations'), dedupAuthorizations);

// Care Team
router.post('/clients/:clientId/care-team', requireRole('admin', 'user'), addCareTeamMember);
router.delete('/clients/:clientId/care-team/:id', requireRole('admin', 'user'), removeCareTeamMember);

// Client Documents
router.post('/clients/:clientId/documents', requireRole('admin', 'user'), upload.single('file'), uploadDocument);
router.get('/documents/:id/download', requireRole('admin', 'user'), downloadDocument);
router.delete('/documents/:id', requireRole('admin', 'user'), deleteDocument);

// Authorization Documents
router.post('/authorizations/:authId/documents', requireRole('admin', 'user'), upload.single('file'), uploadAuthDocument);
router.get('/auth-documents/:id/download', requireRole('admin', 'user'), downloadAuthDocument);
router.delete('/auth-documents/:id', requireRole('admin', 'user'), deleteAuthDocument);

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
router.get('/clients/:clientId/hospital-visits', requireRole('admin', 'user'), listHospitalVisits);
router.post('/clients/:clientId/hospital-visits', requireRole('admin', 'user'), createHospitalVisit);
router.put('/hospital-visits/:id', requireRole('admin', 'user'), updateHospitalVisit);
router.delete('/hospital-visits/:id', requireRole('admin', 'user'), deleteHospitalVisit);

// Incidents
router.get('/clients/:clientId/incidents', requireRole('admin', 'user'), listIncidents);
router.post('/clients/:clientId/incidents', requireRole('admin', 'user'), createIncident);
router.put('/incidents/:id', requireRole('admin', 'user'), updateIncident);
router.delete('/incidents/:id', requireRole('admin', 'user'), deleteIncident);

// Insurance Type routes
router.get('/insurance-types', requireRole('admin', 'user'), requirePermission('insurance-types'), listInsuranceTypes);
router.post('/insurance-types', requireRole('admin', 'user'), requirePermission('insurance-types'), createInsuranceType);
router.delete('/insurance-types/bulk-permanent', requireRole('admin'), requirePermission('insurance-types'), bulkPermanentlyDeleteInsuranceTypes);
router.put('/insurance-types/:id/restore', requireRole('admin', 'user'), requirePermission('insurance-types'), restoreInsuranceType);
router.put('/insurance-types/:id', requireRole('admin', 'user'), requirePermission('insurance-types'), updateInsuranceType);
router.delete('/insurance-types/:id', requireRole('admin', 'user'), requirePermission('insurance-types'), deleteInsuranceType);
router.delete('/insurance-types/:id/permanent', requireRole('admin'), requirePermission('insurance-types'), permanentlyDeleteInsuranceType);

// Service routes
router.get('/services', requireRole('admin', 'user'), requirePermission('services'), listServices);
router.post('/services', requireRole('admin', 'user'), requirePermission('services'), createService);
router.delete('/services/bulk-permanent', requireRole('admin'), requirePermission('services'), bulkPermanentlyDeleteServices);
router.put('/services/:id/restore', requireRole('admin', 'user'), requirePermission('services'), restoreService);
router.put('/services/:id', requireRole('admin', 'user'), requirePermission('services'), updateService);
router.delete('/services/:id', requireRole('admin', 'user'), requirePermission('services'), deleteService);
router.delete('/services/:id/permanent', requireRole('admin'), requirePermission('services'), permanentlyDeleteService);

// Timesheet routes (all authenticated users)
router.get('/timesheets/activities', requirePermission('timesheets'), getActivities);
router.get('/timesheets', requirePermission('timesheets'), listTimesheets);
router.delete('/timesheets/bulk-permanent', requireRole('admin'), requirePermission('timesheets'), bulkPermanentlyDeleteTimesheets);
router.post('/timesheets/send-reminders', requireRole('admin'), requirePermission('timesheets'), sendTimesheetReminders);
router.post('/timesheets/bulk-export-pdf', requireRole('admin', 'user'), requirePermission('timesheets'), exportBulkTimesheetPdf);
router.get('/timesheets/:id', requirePermission('timesheets'), getTimesheet);
router.post('/timesheets', requirePermission('timesheets'), createTimesheet);
router.put('/timesheets/:id/restore', requireRole('admin'), requirePermission('timesheets'), restoreTimesheet);
router.put('/timesheets/:id', requireRole('admin'), requirePermission('timesheets'), updateTimesheet);
router.put('/timesheets/:id/submit', requireRole('admin'), requirePermission('timesheets'), submitTimesheet);
router.post('/timesheets/:id/signing-links', requireRole('admin', 'user'), requirePermission('timesheets'), generateSigningLinks);
router.delete('/timesheets/:id', requireRole('admin'), requirePermission('timesheets'), deleteTimesheet);
router.delete('/timesheets/:id/permanent', requireRole('admin'), requirePermission('timesheets'), permanentlyDeleteTimesheet);
router.get('/timesheets/:id/export-pdf', requireRole('admin', 'user'), requirePermission('timesheets'), exportTimesheetPdf);
router.put('/timesheets/:id/status', requireRole('admin', 'user'), requirePermission('timesheets'), updateTimesheetStatus);

// Permanent link routes
router.get('/permanent-links', requireRole('admin', 'user'), requirePermission('permanent-links'), listPermanentLinks);
router.post('/permanent-links', requireRole('admin', 'user'), requirePermission('permanent-links'), createPermanentLink);
router.delete('/permanent-links/:id', requireRole('admin', 'user'), requirePermission('permanent-links'), deletePermanentLink);

// Payroll
router.get('/payroll/runs',                requireRole('admin', 'user'), requirePermission('payroll'), listPayrollRuns);
router.post('/payroll/runs',               requireRole('admin'), requirePermission('payroll'), upload.single('file'), uploadPayrollRun);
router.delete('/payroll/runs/bulk-permanent', requireRole('admin'), requirePermission('payroll'), bulkPermanentlyDeletePayrollRuns);
router.get('/payroll/runs/:id',            requireRole('admin', 'user'), requirePermission('payroll'), getPayrollRun);
router.patch('/payroll/runs/:id',          requireRole('admin'), requirePermission('payroll'), updatePayrollRun);
router.put('/payroll/runs/:id/restore',    requireRole('admin'), requirePermission('payroll'), restorePayrollRun);
router.delete('/payroll/runs/:id',         requireRole('admin'), requirePermission('payroll'), deletePayrollRun);
router.delete('/payroll/runs/:id/permanent', requireRole('admin'), requirePermission('payroll'), permanentlyDeletePayrollRun);
router.get('/payroll/runs/:id/export',     requireRole('admin', 'user'), requirePermission('payroll'), exportPayrollRun);
router.patch('/payroll/visits/:id',        requireRole('admin'), requirePermission('payroll'), updatePayrollVisit);
router.patch('/payroll/visits/:id/notes',  requireRole('admin', 'user'), requirePermission('payroll'), updatePayrollVisitNotes);

// Employees
// Must precede /employees/:id — otherwise the parameterised route captures
// "nearby" as an id and shadows this endpoint.
router.get('/employees/nearby', requireRole('admin', 'user'), requirePermission('scheduling'), getNearbyEmployees);
router.get('/employees',       requireRole('admin', 'user'), requirePermission('employees'), listEmployees);
router.get('/employees/archived', requireRole('admin', 'user'), requirePermission('employees'), listArchivedEmployees);
router.post('/employees/restore', requireRole('admin', 'user'), requirePermission('employees'), restoreEmployees);
router.delete('/employees/bulk-permanent', requireRole('admin'), requirePermission('employees'), bulkPermanentlyDeleteEmployees);
router.get('/employees/:id',   requireRole('admin', 'user'), requirePermission('employees'), getEmployee);
router.post('/employees',      requireRole('admin', 'user'), requirePermission('employees'), createEmployee);
router.post('/employees/bulk-import', requireRole('admin'), requirePermission('employees'), upload.single('file'), bulkImportEmployees);
router.put('/employees/:id/restore', requireRole('admin', 'user'), requirePermission('employees'), restoreEmployee);
router.put('/employees/:id',   requireRole('admin', 'user'), requirePermission('employees'), updateEmployee);
router.delete('/employees/:id', requireRole('admin', 'user'), requirePermission('employees'), deleteEmployee);
router.delete('/employees/:id/permanent', requireRole('admin'), requirePermission('employees'), permanentlyDeleteEmployee);
router.post('/employees/:id/resend-invite', requireRole('admin'), requirePermission('employees'), resendInvite);
router.patch('/employees/:id/approve-onboarding', requireRole('admin'), requirePermission('employees'), approveOnboarding);
router.get('/employees/:id/onboarding-link', requireRole('admin'), requirePermission('employees'), getOnboardingLink);
router.get('/employees/:id/availability', requireRole('admin', 'user'), requirePermission('employees'), getEmployeeAvailability);

// Employee Certifications
router.get('/employees/:employeeId/certifications', requireRole('admin', 'user'), requirePermission('employees'), listCertifications);
// Internal record — admin/office only, never reachable from the employee portal.
router.get('/employees/:employeeId/notes-timeline', requireRole('admin', 'user'), requirePermission('employees'), listEmployeeNotesTimeline);
router.get('/employees/:employeeId/notes-timeline/export', requireRole('admin', 'user'), requirePermission('employees'), exportEmployeeNotesPdf);
router.post('/employees/:employeeId/certifications', requireRole('admin', 'user'), requirePermission('employees'), upload.single('file'), createCertification);
router.put('/certifications/:id', requireRole('admin', 'user'), requirePermission('employees'), upload.single('file'), updateCertification);
router.delete('/certifications/:id', requireRole('admin', 'user'), requirePermission('employees'), deleteCertification);
router.get('/certifications/:id/download', requireRole('admin', 'user'), requirePermission('employees'), downloadCertification);
router.get('/certification-uploads/:id/download', requireRole('admin', 'user'), requirePermission('employees'), downloadCertificationUpload);

// Employee Attention
router.get('/admin/employee-attention', requireRole('admin', 'user'), requirePermission('employees'), getEmployeeAttention);
router.post('/admin/employee-attention/mark-seen', requireRole('admin', 'user'), requirePermission('employees'), markAttentionSeen);

// Scheduling
router.get('/shifts',                       requireRole('admin', 'user'), requirePermission('scheduling'), listShifts);
router.get('/shifts/auth-check',            requireRole('admin', 'user'), requirePermission('scheduling'), authCheck);
router.get('/shifts/client/:clientId',      requireRole('admin', 'user'), requirePermission('scheduling'), getClientSchedule);
router.get('/shifts/employee/:employeeId',  requireRole('admin', 'user'), requirePermission('scheduling'), getEmployeeSchedule);
router.post('/shifts',                      requireRole('admin', 'user'), requirePermission('scheduling'), createShift);
router.patch('/shifts/bulk',                requireRole('admin', 'user'), requirePermission('scheduling'), bulkUpdateShifts);
router.patch('/shifts/bulk-per-shift',      requireRole('admin', 'user'), requirePermission('scheduling'), bulkUpdateShiftsPerShift);
router.delete('/shifts/bulk',               requireRole('admin', 'user'), requirePermission('scheduling'), bulkDeleteShifts);
router.get('/shifts/bulk-edit-batches',      requireRole('admin', 'user'), requirePermission('scheduling'), listBulkEditBatches);
router.post('/shifts/bulk-undo/:batchId',   requireRole('admin', 'user'), requirePermission('scheduling'), bulkUndoBatch);
router.post('/shifts/:id/repeat',            requireRole('admin', 'user'), requirePermission('scheduling'), repeatShift);
router.put('/shifts/:id/restore',           requireRole('admin', 'user'), requirePermission('scheduling'), restoreShift);
router.post('/shifts/restore',              requireRole('admin', 'user'), requirePermission('scheduling'), restoreShifts);
router.delete('/shifts/permanent',          requireRole('admin'), requirePermission('scheduling'), permanentDeleteShifts);
router.get('/shifts/archived',              requireRole('admin', 'user'), requirePermission('scheduling'), listArchivedShifts);
// Replacement workflow — declared before /shifts/:id so the more specific
// paths are not shadowed by the parameterised route.
router.post('/shifts/:id/callout',                  requireRole('admin', 'user'), requirePermission('scheduling'), recordCallout);
router.get('/shifts/:id/replacement-candidates',    requireRole('admin', 'user'), requirePermission('scheduling'), getReplacementCandidates);
router.post('/shifts/:id/offers',                   requireRole('admin', 'user'), requirePermission('scheduling'), createOffer);
router.post('/shifts/:id/auto-offer',               requireRole('admin', 'user'), requirePermission('scheduling'), startAutoOffer);
router.get('/shifts/:id/offers',                    requireRole('admin', 'user'), requirePermission('scheduling'), listOffers);
router.post('/shifts/:id/offers/:offerId/record-response', requireRole('admin', 'user'), requirePermission('scheduling'), recordOfferResponse);
router.post('/callouts/:id/resolve',                requireRole('admin', 'user'), requirePermission('scheduling'), resolveCalloutRoute);

router.put('/shifts/:id',                   requireRole('admin', 'user'), requirePermission('scheduling'), updateShift);
router.delete('/shifts/all',                requireRole('admin', 'user'), requirePermission('scheduling'), deleteAllShifts);
router.delete('/shifts/:id',                requireRole('admin', 'user'), requirePermission('scheduling'), deleteShift);

// Schedule Notifications
router.post('/schedule-notifications/send',       requireRole('admin', 'user'), requirePermission('scheduling'), sendSchedules);
router.get('/schedule-notifications/status',      requireRole('admin', 'user'), requirePermission('scheduling'), getNotificationStatus);
router.get('/schedule-notifications/responses',   requireRole('admin', 'user'), requirePermission('scheduling'), getScheduleResponses);
router.get('/schedule-notifications/employee/:employeeId', requireRole('admin', 'user'), requirePermission('scheduling'), getEmployeeNotificationHistory);

// Employee Schedule Links
router.get('/employee-schedule-links',        requireRole('admin', 'user'), requirePermission('scheduling'), listLinks);
router.post('/employee-schedule-links',       requireRole('admin', 'user'), requirePermission('scheduling'), createLink);
router.delete('/employee-schedule-links/:id', requireRole('admin', 'user'), requirePermission('scheduling'), deleteLink);

// Client Activities
router.get('/clients/:clientId/activities', listActivities);
router.post('/clients/:clientId/activities', createActivity);
router.delete('/activities/:id', requireRole('admin'), deleteActivity);

// Client Notes Timeline (read-only aggregation of every note tied to a client)
router.get('/clients/:clientId/notes-timeline', requirePermission('clients'), listNotesTimeline);
router.get('/clients/:clientId/notes-timeline/export', requirePermission('clients'), exportClientNotesPdf);

// Audit Logs (admin only)
router.get('/audit-logs',                     requireRole('admin'), requirePermission('history'), getAuditLogs);
router.get('/audit-logs/:entityType/:entityId', requireRole('admin'), requirePermission('history'), getEntityAuditLogs);

// Tasks
router.get('/tasks/summary', requireRole('admin', 'user'), requirePermission('tasks'), getTaskSummary);
router.get('/tasks', requireRole('admin', 'user'), requirePermission('tasks'), listTasks);
router.patch('/tasks/bulk-update', requireRole('admin'), requirePermission('tasks'), bulkUpdateTasks);
router.get('/tasks/:id', requireRole('admin', 'user'), requirePermission('tasks'), getTask);
router.post('/tasks', requireRole('admin'), requirePermission('tasks'), createTask);
router.patch('/tasks/:id', requireRole('admin', 'user'), requirePermission('tasks'), updateTask);
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
