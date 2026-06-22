const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const apiRoutes = require('./routes/api');

const app = express();

// ── Middleware ──
app.use(compression());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.EMPLOYEE_APP_ORIGIN,
    process.env.ADMIN_APP_ORIGIN,
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());

// ── Routes ──
app.use('/api', apiRoutes);

// ── Health check ──
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Serve employee app at /employee ──
const employeeDist = path.join(__dirname, '../../employee-app/dist');
app.use('/employee', express.static(employeeDist, {
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    },
}));
app.get('/employee/*', (_req, res) => {
    res.sendFile(path.join(employeeDist, 'index.html'));
});

// ── Serve admin client build at / ──
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist, {
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    },
}));
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Global error handler ──
app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large. Maximum size is 20 MB.' });
    }
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
