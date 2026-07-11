const express = require('express');
const { requireRole } = require('../middleware/authMiddleware');
const { listAgencies, createAgency, updateAgency, suspendAgency, reactivateAgency, impersonate } = require('../controllers/platformController');
const { platformBackup } = require('../controllers/backupController');

const router = express.Router();
router.use(requireRole('superadmin'));
router.get('/agencies', listAgencies);
router.post('/agencies', createAgency);
router.patch('/agencies/:id', updateAgency);
router.put('/agencies/:id/suspend', suspendAgency);
router.put('/agencies/:id/reactivate', reactivateAgency);
router.post('/agencies/:id/impersonate', impersonate);
router.get('/backup', platformBackup);
router.use((req, res) => res.status(404).json({ error: 'Not found' }));
module.exports = router;
