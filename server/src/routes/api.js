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
} = require('../controllers/insuranceTypeController');
const {
    listServices,
    createService,
    updateService,
    deleteService,
    restoreService,
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
} = require('../controllers/schedulingController');
const {
    listEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    restoreEmployee,
} = require('../controllers/employeeController');
const { getDashboardStats } = require('../controllers/dashboardController');
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule } = require('../controllers/scheduleNotificationController');
const { createLink, listLinks, deleteLink, getScheduleView } = require('../controllers/employeeScheduleLinkController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public routes (no auth) ──
router.post('/auth/login', login);
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
router.get('/auth/users', requireRole('admin'), listUsers);
router.delete('/auth/users/:id', requireRole('admin'), deleteUser);
router.put('/auth/users/:id/restore', requireRole('admin'), restoreUser);

// Dashboard
router.get('/dashboard/stats', requireRole('admin', 'user'), getDashboardStats);

// Client routes — bulk import is admin only, everything else is admin + user
router.get('/clients', requireRole('admin', 'user'), listClients);
router.get('/clients/:id', requireRole('admin', 'user'), getClient);
router.post('/clients', requireRole('admin', 'user'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin', 'user'), bulkDelete);
router.put('/clients/:id/restore', requireRole('admin', 'user'), restoreClient);
router.put('/clients/:id', requireRole('admin', 'user'), updateClient);
router.patch('/clients/:id', requireRole('admin', 'user'), patchClient);
router.delete('/clients/:id', requireRole('admin', 'user'), deleteClient);

// Authorization routes
router.post('/clients/:clientId/authorizations', requireRole('admin', 'user'), createAuthorization);
router.put('/authorizations/:id', requireRole('admin', 'user'), updateAuthorization);
router.delete('/authorizations/:id', requireRole('admin', 'user'), deleteAuthorization);

// Insurance Type routes
router.get('/insurance-types', requireRole('admin', 'user'), listInsuranceTypes);
router.post('/insurance-types', requireRole('admin', 'user'), createInsuranceType);
router.put('/insurance-types/:id/restore', requireRole('admin', 'user'), restoreInsuranceType);
router.put('/insurance-types/:id', requireRole('admin', 'user'), updateInsuranceType);
router.delete('/insurance-types/:id', requireRole('admin', 'user'), deleteInsuranceType);

// Service routes
router.get('/services', requireRole('admin', 'user'), listServices);
router.post('/services', requireRole('admin', 'user'), createService);
router.put('/services/:id/restore', requireRole('admin', 'user'), restoreService);
router.put('/services/:id', requireRole('admin', 'user'), updateService);
router.delete('/services/:id', requireRole('admin', 'user'), deleteService);

// Timesheet routes (all authenticated users)
router.get('/timesheets/activities', getActivities);
router.get('/timesheets', listTimesheets);
router.get('/timesheets/:id', getTimesheet);
router.post('/timesheets', createTimesheet);
router.put('/timesheets/:id/restore', restoreTimesheet);
router.put('/timesheets/:id', updateTimesheet);
router.put('/timesheets/:id/submit', submitTimesheet);
router.post('/timesheets/:id/signing-links', requireRole('admin', 'user'), generateSigningLinks);
router.delete('/timesheets/:id', deleteTimesheet);
router.get('/timesheets/:id/export-pdf', requireRole('admin', 'user'), exportTimesheetPdf);
router.put('/timesheets/:id/status', requireRole('admin', 'user'), updateTimesheetStatus);

// Permanent link routes
router.get('/permanent-links', requireRole('admin', 'user'), listPermanentLinks);
router.post('/permanent-links', requireRole('admin', 'user'), createPermanentLink);
router.delete('/permanent-links/:id', requireRole('admin', 'user'), deletePermanentLink);

// Payroll
router.get('/payroll/runs',                requireRole('admin', 'user'), listPayrollRuns);
router.post('/payroll/runs',               requireRole('admin', 'user'), upload.single('file'), uploadPayrollRun);
router.get('/payroll/runs/:id',            requireRole('admin', 'user'), getPayrollRun);
router.put('/payroll/runs/:id/restore',    requireRole('admin', 'user'), restorePayrollRun);
router.delete('/payroll/runs/:id',         requireRole('admin', 'user'), deletePayrollRun);
router.get('/payroll/runs/:id/export',     requireRole('admin', 'user'), exportPayrollRun);
router.patch('/payroll/visits/:id',        requireRole('admin', 'user'), updatePayrollVisit);

// Employees
router.get('/employees',       requireRole('admin', 'user'), listEmployees);
router.get('/employees/:id',   requireRole('admin', 'user'), getEmployee);
router.post('/employees',      requireRole('admin', 'user'), createEmployee);
router.put('/employees/:id/restore', requireRole('admin', 'user'), restoreEmployee);
router.put('/employees/:id',   requireRole('admin', 'user'), updateEmployee);
router.delete('/employees/:id', requireRole('admin', 'user'), deleteEmployee);

// Scheduling
router.get('/shifts',                       requireRole('admin', 'user'), listShifts);
router.get('/shifts/auth-check',            requireRole('admin', 'user'), authCheck);
router.get('/shifts/client/:clientId',      requireRole('admin', 'user'), getClientSchedule);
router.get('/shifts/employee/:employeeId',  requireRole('admin', 'user'), getEmployeeSchedule);
router.post('/shifts',                      requireRole('admin', 'user'), createShift);
router.put('/shifts/:id/restore',           requireRole('admin', 'user'), restoreShift);
router.put('/shifts/:id',                   requireRole('admin', 'user'), updateShift);
router.delete('/shifts/all',                requireRole('admin', 'user'), deleteAllShifts);
router.delete('/shifts/:id',                requireRole('admin', 'user'), deleteShift);

// Schedule Notifications
router.post('/schedule-notifications/send',   requireRole('admin', 'user'), sendSchedules);
router.get('/schedule-notifications/status',  requireRole('admin', 'user'), getNotificationStatus);

// Employee Schedule Links
router.get('/employee-schedule-links',        requireRole('admin', 'user'), listLinks);
router.post('/employee-schedule-links',       requireRole('admin', 'user'), createLink);
router.delete('/employee-schedule-links/:id', requireRole('admin', 'user'), deleteLink);

module.exports = router;
