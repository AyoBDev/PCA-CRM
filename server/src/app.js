const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const apiRoutes = require('./routes/api');
const { resolveAgency } = require('./middleware/resolveAgency');
const { corsOrigin } = require('./lib/corsOrigin');

const app = express();

// Behind Railway's proxy — needed for secure cookies / correct client IPs
// (rate limiting keys on IP).
app.set('trust proxy', 1);

// ── Middleware ──
// Security headers (HSTS, X-Content-Type-Options, frameguard, etc.).
// Content-Security-Policy is left disabled: the app serves a bundled React SPA
// from this same origin and a strict default CSP would block it. A tailored CSP
// can be added later once tested against the built client.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(resolveAgency);

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
module.exports.corsOrigin = corsOrigin;
