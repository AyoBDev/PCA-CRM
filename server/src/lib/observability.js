// Centralized error tracking (Sentry).
//
// Sentry is a NO-OP unless SENTRY_DSN is set, so local dev and the test suite
// run untouched — nothing is sent anywhere. In production, set SENTRY_DSN (plus
// optionally SENTRY_ENVIRONMENT / SENTRY_TRACES_SAMPLE_RATE) and unhandled
// server errors are captured, grouped, and alertable instead of vanishing into
// the container log.
//
// IMPORTANT: `initObservability()` must run BEFORE the Express app and most
// other requires so Sentry's auto-instrumentation can hook the HTTP layer. It
// is called at the very top of src/index.js.

const Sentry = require('@sentry/node');

let enabled = false;

function initObservability() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        // No DSN → error tracking is off. This is the expected state in dev/test.
        return false;
    }

    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
        release: process.env.SENTRY_RELEASE || undefined,
        // Performance tracing is opt-in and off by default (0) to avoid overhead
        // and cost; set SENTRY_TRACES_SAMPLE_RATE (e.g. 0.1) to sample traces.
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
        // Never let PHI leak into error reports. We attach our own minimal user
        // context (id/role only) in the request middleware below.
        sendDefaultPii: false,
    });

    enabled = true;
    console.log('[observability] Sentry error tracking enabled');
    return true;
}

function isEnabled() {
    return enabled;
}

// Attach the Express error handler. Safe to call whether or not Sentry is
// enabled — when disabled, setupExpressErrorHandler installs a passthrough.
function setupExpressErrorHandler(app) {
    Sentry.setupExpressErrorHandler(app);
}

// Tag the current scope with the authenticated user (no PHI — id and role only)
// so captured errors can be grouped and traced back to a session. Call from an
// auth-aware middleware; no-op when tracking is disabled.
function setRequestUser(req) {
    if (!enabled) return;
    const u = req && req.user;
    if (u && (u.id != null || u.role)) {
        Sentry.setUser({ id: u.id != null ? String(u.id) : undefined, role: u.role });
    }
}

// Explicitly capture a handled error (e.g. a background job failure that we
// catch and log but want visibility into). No-op when disabled.
function captureError(err, context) {
    if (!enabled) return;
    Sentry.captureException(err, context ? { extra: context } : undefined);
}

// Flush buffered events before the process exits (e.g. on fatal error) so we
// don't lose the report. Resolves quickly when disabled.
async function flush(timeoutMs = 2000) {
    if (!enabled) return;
    try {
        await Sentry.flush(timeoutMs);
    } catch {
        // Never let a flush failure mask the original error.
    }
}

module.exports = {
    initObservability,
    isEnabled,
    setupExpressErrorHandler,
    setRequestUser,
    captureError,
    flush,
};
