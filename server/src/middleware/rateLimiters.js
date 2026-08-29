// Rate limiters for expensive authenticated endpoints.
//
// Auth endpoints already have their own (IP-keyed) limiter in routes/api.js.
// These protect the *expensive* operations — PDF/zip generation, receipt
// generation, and file-parsing uploads (bulk imports, Sandata) — from abuse or a
// runaway/compromised session hammering them.
//
// Keying: these routes are authenticated, so we key on the USER id, not the IP.
// Many admins in one agency can share a single office IP (NAT), so an IP key
// would let one busy user throttle their colleagues. A per-user key caps each
// account independently and still stops a single session from looping. Falls
// back to IP for the (unauthenticated) edge cases.

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// Derive the throttle key: authenticated user id when present, else client IP.
// `req.ip` is trustworthy because the app sets `trust proxy` (see app.js).
// For the IP fallback we run the address through express-rate-limit's
// `ipKeyGenerator`, which normalizes IPv6 to its /64 subnet — a raw req.ip would
// let an IPv6 user rotate addresses within their allocation to dodge the limit.
function keyByUserOrIp(req) {
    if (req.user && req.user.id != null) return `user:${req.user.id}`;
    return `ip:${ipKeyGenerator(req.ip)}`;
}

const commonOptions = {
    standardHeaders: true, // RateLimit-* headers so clients can back off
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    message: { error: 'Too many requests for this operation. Please wait a minute and try again.' },
};

// Heavy generation: PDF exports, zip export, receipt generation. These build
// documents on the fly and can be memory/CPU heavy. 30 per 15 min per user is
// generous for real admin work (bulk-exporting a payroll run, printing
// timesheets) while stopping a loop that fires hundreds.
const heavyOperationLimiter = rateLimit({
    ...commonOptions,
    windowMs: 15 * 60 * 1000,
    max: 30,
});

// Upload parsing: bulk imports and Sandata preview parse an uploaded
// spreadsheet server-side. Stricter (10 per 15 min per user) — a human imports a
// file occasionally, not dozens of times a minute, and parsing untrusted files
// is the higher-risk surface.
const uploadParseLimiter = rateLimit({
    ...commonOptions,
    windowMs: 15 * 60 * 1000,
    max: 10,
});

module.exports = { heavyOperationLimiter, uploadParseLimiter, keyByUserOrIp };
