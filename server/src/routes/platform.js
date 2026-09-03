const express = require('express');
const { requireRole } = require('../middleware/authMiddleware');
const { listAgencies, createAgency, resetDemoAgency, updateAgency, suspendAgency, reactivateAgency, impersonate } = require('../controllers/platformController');
const { platformBackup } = require('../controllers/backupController');

const router = express.Router();
// Off the platform host (e.g. a superadmin token replayed against an agency
// subdomain), the platform console doesn't exist — 404, not 403, so the
// route surface itself isn't discoverable from agency hosts.
router.use((req, res, next) => {
    if (!req.isPlatformHost) return res.status(404).json({ error: 'Not found' });
    next();
});
router.use(requireRole('superadmin'));
router.get('/agencies', listAgencies);
router.post('/agencies', createAgency);
// Destructive: wipes and rebuilds the demo tenant (slug fixed server-side).
router.post('/demo-agency', resetDemoAgency);
router.patch('/agencies/:id', updateAgency);
router.put('/agencies/:id/suspend', suspendAgency);
router.put('/agencies/:id/reactivate', reactivateAgency);
router.post('/agencies/:id/impersonate', impersonate);
router.get('/backup', platformBackup);
router.use((req, res) => res.status(404).json({ error: 'Not found' }));
module.exports = router;
