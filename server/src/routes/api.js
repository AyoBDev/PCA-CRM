const express = require('express');
const {
    listClients,
    getClient,
    createClient,
    updateClient,
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
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Public routes (no auth) ──
router.post('/auth/login', login);
router.get('/sign/:token', getSigningForm);
router.put('/sign/:token', submitSigningForm);

// ── All routes below require authentication ──
router.use(authenticate);

// Auth (authenticated)
router.get('/auth/me', getMe);

// Auth (admin only)
router.post('/auth/register', requireRole('admin'), register);
router.get('/auth/users', requireRole('admin'), listUsers);
router.delete('/auth/users/:id', requireRole('admin'), deleteUser);

// Client routes (admin only)
router.get('/clients', requireRole('admin'), listClients);
router.get('/clients/:id', requireRole('admin'), getClient);
router.post('/clients', requireRole('admin'), createClient);
router.post('/clients/bulk-import', requireRole('admin'), bulkImport);
router.post('/clients/bulk-delete', requireRole('admin'), bulkDelete);
router.put('/clients/:id', requireRole('admin'), updateClient);
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

module.exports = router;
