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
} = require('../controllers/insuranceTypeController');
const {
    listServices,
    createService,
    updateService,
    deleteService,
} = require('../controllers/serviceController');
const {
    listTimesheets,
    getTimesheet,
    getActivities,
    createTimesheet,
    updateTimesheet,
    submitTimesheet,
    deleteTimesheet,
    exportTimesheetPdf,
} = require('../controllers/timesheetController');
const {
    login,
    getMe,
    register,
    listUsers,
    deleteUser,
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
} = require('../controllers/schedulingController');
const {
    listEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
} = require('../controllers/employeeController');
const { getDashboardStats } = require('../controllers/dashboardController');
const { sendSchedules, getNotificationStatus, getScheduleConfirm, confirmSchedule } = require('../controllers/scheduleNotificationController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public routes (no auth) ──
router.post('/auth/login', login);
router.get('/sign/:token', getSigningForm);
router.put('/sign/:token', submitSigningForm);
router.get('/schedule/confirm/:token', getScheduleConfirm);
router.put('/schedule/confirm/:token', confirmSchedule);

// ── All routes below require authentication ──
router.use(authenticate);

// Auth (authenticated)
router.get('/auth/me', getMe);

// Auth (admin only)
router.post('/auth/register', requireRole('admin'), register);
router.get('/auth/users', requireRole('admin'), listUsers);
router.delete('/auth/users/:id', requireRole('admin'), deleteUser);

// Dashboard (admin only)
router.get('/dashboard/stats', requireRole('admin'), getDashboardStats);

// Client routes (admin only)
router.get('/clients', requireRole('admin'), listClients);
router.get('/clients/:id', requireRole('admin'), getClient);
router.post('/clients', requireRole('admin'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin'), bulkDelete);
router.put('/clients/:id', requireRole('admin'), updateClient);
router.patch('/clients/:id', requireRole('admin'), patchClient);
router.delete('/clients/:id', requireRole('admin'), deleteClient);

// Authorization routes (admin only)
router.post('/clients/:clientId/authorizations', requireRole('admin'), createAuthorization);
router.put('/authorizations/:id', requireRole('admin'), updateAuthorization);
router.delete('/authorizations/:id', requireRole('admin'), deleteAuthorization);

// Insurance Type routes (admin only)
router.get('/insurance-types', requireRole('admin'), listInsuranceTypes);
router.post('/insurance-types', requireRole('admin'), createInsuranceType);
router.put('/insurance-types/:id', requireRole('admin'), updateInsuranceType);
router.delete('/insurance-types/:id', requireRole('admin'), deleteInsuranceType);

// Service routes (admin only)
router.get('/services', requireRole('admin'), listServices);
router.post('/services', requireRole('admin'), createService);
router.put('/services/:id', requireRole('admin'), updateService);
router.delete('/services/:id', requireRole('admin'), deleteService);

// Timesheet routes (all authenticated users)
router.get('/timesheets/activities', getActivities);
router.get('/timesheets', listTimesheets);
router.get('/timesheets/:id', getTimesheet);
router.post('/timesheets', createTimesheet);
router.put('/timesheets/:id', updateTimesheet);
router.put('/timesheets/:id/submit', submitTimesheet);
router.post('/timesheets/:id/signing-links', requireRole('admin'), generateSigningLinks);
router.delete('/timesheets/:id', deleteTimesheet);
router.get('/timesheets/:id/export-pdf', requireRole('admin'), exportTimesheetPdf);

// Payroll (admin only)
router.get('/payroll/runs',                requireRole('admin'), listPayrollRuns);
router.post('/payroll/runs',               requireRole('admin'), upload.single('file'), uploadPayrollRun);
router.get('/payroll/runs/:id',            requireRole('admin'), getPayrollRun);
router.delete('/payroll/runs/:id',         requireRole('admin'), deletePayrollRun);
router.get('/payroll/runs/:id/export',     requireRole('admin'), exportPayrollRun);
router.patch('/payroll/visits/:id',        requireRole('admin'), updatePayrollVisit);

// Employees (admin only)
router.get('/employees',       requireRole('admin'), listEmployees);
router.get('/employees/:id',   requireRole('admin'), getEmployee);
router.post('/employees',      requireRole('admin'), createEmployee);
router.put('/employees/:id',   requireRole('admin'), updateEmployee);
router.delete('/employees/:id', requireRole('admin'), deleteEmployee);

// Scheduling (admin only)
router.get('/shifts',                       requireRole('admin'), listShifts);
router.get('/shifts/auth-check',            requireRole('admin'), authCheck);
router.get('/shifts/client/:clientId',      requireRole('admin'), getClientSchedule);
router.get('/shifts/employee/:employeeId',  requireRole('admin'), getEmployeeSchedule);
router.post('/shifts',                      requireRole('admin'), createShift);
router.put('/shifts/:id',                   requireRole('admin'), updateShift);
router.delete('/shifts/all',                requireRole('admin'), deleteAllShifts);
router.delete('/shifts/:id',                requireRole('admin'), deleteShift);

// Schedule Notifications (admin only)
router.post('/schedule-notifications/send',   requireRole('admin'), sendSchedules);
router.get('/schedule-notifications/status',  requireRole('admin'), getNotificationStatus);

module.exports = router;
