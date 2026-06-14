const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { requireEmployeeLink } = require('../middleware/requireEmployeeLink');

const router = express.Router();

// All employee routes require auth + employee link
router.use(authenticate);
router.use(requireEmployeeLink);

// Routes will be added per-module in subsequent tasks

module.exports = router;
