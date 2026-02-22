const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Routes ──
app.use('/api', apiRoutes);

// ── Health check ──
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Global error handler ──
app.use((err, _req, res, _next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
