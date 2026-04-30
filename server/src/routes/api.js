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
} = require('../controllers/clientController');
const {
    createAuthorization,
    updateAuthorization,
    deleteAuthorization,
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
    updateTimesheetStatus,
} = require('../controllers/timesheetController');
const { createPermanentLink, listPermanentLinks, deletePermanentLink } = require('../controllers/permanentLinkController');
const { getPcaForm, updatePcaForm } = require('../controllers/pcaFormController');
const {
    login,
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
    deletePayrollRun,
    restorePayrollRun,
    permanentlyDeletePayrollRun,
    bulkPermanentlyDeletePayrollRuns,
    exportPayrollRun,
    updatePayrollVisit,
} = require('../controllers/payrollController');
const {
    listShifts,
    createShift,
    updateShift,
    deleteShift,
    getClientSchedule,
    getEmployeeSchedule,
    deleteAllShifts,
    authCheck,
    restoreShift,
    repeatShift,
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
} = require('../controllers/employeeController');
const { getDashboardStats } = require('../controllers/dashboardController');
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule } = require('../controllers/scheduleNotificationController');
const { createLink, listLinks, deleteLink, getScheduleView } = require('../controllers/employeeScheduleLinkController');
const { getAuditLogs, getEntityAuditLogs } = require('../controllers/auditController');
const { exportBackup } = require('../controllers/backupController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public routes (no auth) ──
router.post('/auth/login', login);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password-with-token', resetPasswordWithToken);
router.get('/sign/:token', getSigningForm);
router.put('/sign/:token', submitSigningForm);
router.get('/schedule/confirm/:token', getScheduleConfirm);
router.put('/schedule/confirm/:token', confirmSchedule);
router.get('/schedule/view/:token', getScheduleView);
router.get('/pca-form/:token', getPcaForm);
router.put('/pca-form/:token', updatePcaForm);

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
router.delete('/clients/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteClients);
router.get('/clients/:id', requireRole('admin', 'user', 'pca'), getClient);
router.post('/clients', requireRole('admin', 'user', 'pca'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin', 'user', 'pca'), bulkDelete);
router.put('/clients/:id/restore', requireRole('admin', 'user', 'pca'), restoreClient);
router.put('/clients/:id', requireRole('admin', 'user', 'pca'), updateClient);
router.patch('/clients/:id', requireRole('admin', 'user', 'pca'), patchClient);
router.delete('/clients/:id', requireRole('admin', 'user', 'pca'), deleteClient);
router.delete('/clients/:id/permanent', requireRole('admin'), permanentlyDeleteClient);

// Authorization routes
router.post('/clients/:clientId/authorizations', requireRole('admin', 'user', 'pca'), createAuthorization);
router.put('/authorizations/:id', requireRole('admin', 'user', 'pca'), updateAuthorization);
router.delete('/authorizations/:id', requireRole('admin', 'user', 'pca'), deleteAuthorization);

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
router.get('/timesheets/:id', getTimesheet);
router.post('/timesheets', createTimesheet);
router.put('/timesheets/:id/restore', restoreTimesheet);
router.put('/timesheets/:id', updateTimesheet);
router.put('/timesheets/:id/submit', submitTimesheet);
router.post('/timesheets/:id/signing-links', requireRole('admin', 'user', 'pca'), generateSigningLinks);
router.delete('/timesheets/:id', deleteTimesheet);
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
router.put('/payroll/runs/:id/restore',    requireRole('admin'), restorePayrollRun);
router.delete('/payroll/runs/:id',         requireRole('admin'), deletePayrollRun);
router.delete('/payroll/runs/:id/permanent', requireRole('admin'), permanentlyDeletePayrollRun);
router.get('/payroll/runs/:id/export',     requireRole('admin', 'user', 'pca'), exportPayrollRun);
router.patch('/payroll/visits/:id',        requireRole('admin'), updatePayrollVisit);

// Employees
router.get('/employees',       requireRole('admin', 'user', 'pca'), listEmployees);
router.delete('/employees/bulk-permanent', requireRole('admin'), bulkPermanentlyDeleteEmployees);
router.get('/employees/:id',   requireRole('admin', 'user', 'pca'), getEmployee);
router.post('/employees',      requireRole('admin', 'user', 'pca'), createEmployee);
router.put('/employees/:id/restore', requireRole('admin', 'user', 'pca'), restoreEmployee);
router.put('/employees/:id',   requireRole('admin', 'user', 'pca'), updateEmployee);
router.delete('/employees/:id', requireRole('admin', 'user', 'pca'), deleteEmployee);
router.delete('/employees/:id/permanent', requireRole('admin'), permanentlyDeleteEmployee);

// Scheduling
router.get('/shifts',                       requireRole('admin', 'user', 'pca'), listShifts);
router.get('/shifts/auth-check',            requireRole('admin', 'user', 'pca'), authCheck);
router.get('/shifts/client/:clientId',      requireRole('admin', 'user', 'pca'), getClientSchedule);
router.get('/shifts/employee/:employeeId',  requireRole('admin', 'user', 'pca'), getEmployeeSchedule);
router.post('/shifts',                      requireRole('admin', 'user', 'pca'), createShift);
router.post('/shifts/:id/repeat',            requireRole('admin', 'user', 'pca'), repeatShift);
router.put('/shifts/:id/restore',           requireRole('admin', 'user', 'pca'), restoreShift);
router.put('/shifts/:id',                   requireRole('admin', 'user', 'pca'), updateShift);
router.delete('/shifts/all',                requireRole('admin', 'user', 'pca'), deleteAllShifts);
router.delete('/shifts/:id',                requireRole('admin', 'user', 'pca'), deleteShift);

// Schedule Notifications
router.post('/schedule-notifications/send',   requireRole('admin', 'user', 'pca'), sendSchedules);
router.get('/schedule-notifications/status',  requireRole('admin', 'user', 'pca'), getNotificationStatus);

// Employee Schedule Links
router.get('/employee-schedule-links',        requireRole('admin', 'user', 'pca'), listLinks);
router.post('/employee-schedule-links',       requireRole('admin', 'user', 'pca'), createLink);
router.delete('/employee-schedule-links/:id', requireRole('admin', 'user', 'pca'), deleteLink);

// Audit Logs (admin only)
router.get('/audit-logs',                     requireRole('admin'), getAuditLogs);
router.get('/audit-logs/:entityType/:entityId', requireRole('admin'), getEntityAuditLogs);

// Backup (admin only)
router.get('/backup/export', requireRole('admin'), exportBackup);

module.exports = router;
