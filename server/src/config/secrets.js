// Centralized, validated secret access.
//
// JWT_SECRET must be set in production. If it is missing we refuse to start
// rather than silently falling back to a value committed in source (which would
// let anyone forge tokens). In non-production (test/dev) a deterministic
// fallback is allowed so local tooling and the test suite can run without extra
// setup — those environments are not internet-facing.

const isProd = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET;

if (isProd && !JWT_SECRET) {
    throw new Error(
        'JWT_SECRET is not set. Refusing to start in production without a signing secret.'
    );
}

// Non-production fallback only. Never reached in production (the guard above throws).
const RESOLVED_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret';

module.exports = { JWT_SECRET: RESOLVED_JWT_SECRET };
