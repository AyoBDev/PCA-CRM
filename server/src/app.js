const path = require('path');
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

// ── Serve client build in production ──
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Global error handler ──
app.use((err, _req, res, _next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
