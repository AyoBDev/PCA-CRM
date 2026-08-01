// Fail-fast validation of security-critical env vars, run at server boot
// BEFORE anything starts listening. A deploy that is missing its encryption
// key must crash loudly here rather than boot "successfully" and silently
// store PHI in plaintext.
//
// Set ALLOW_PLAINTEXT_PHI=true to opt out (local development only) — this is
// the ONLY way to run without a key, and it is intentionally explicit so it
// can never happen by accident on a real deploy.

function isHex64(v) {
    return typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v);
}

function validateEnv() {
    const errors = [];
    const { ENCRYPTION_KEY, INTEGRITY_KEY, ALLOW_PLAINTEXT_PHI } = process.env;
    const allowPlaintext = ALLOW_PLAINTEXT_PHI === 'true';

    if (!ENCRYPTION_KEY) {
        if (!allowPlaintext) {
            errors.push(
                'ENCRYPTION_KEY is not set. PHI (Medicaid IDs, DOBs, notes) would be stored in PLAINTEXT.\n' +
                '  Fix: set ENCRYPTION_KEY to 64 hex chars (generate with `openssl rand -hex 32`).\n' +
                '  For local dev without encryption, set ALLOW_PLAINTEXT_PHI=true explicitly.'
            );
        } else {
            console.warn('[validateEnv] ALLOW_PLAINTEXT_PHI=true — PHI will be stored in PLAINTEXT. Never use this in production.');
        }
    } else if (!isHex64(ENCRYPTION_KEY)) {
        errors.push('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Generate with `openssl rand -hex 32`.');
    }

    // INTEGRITY_KEY is optional: it falls back to an HKDF of ENCRYPTION_KEY.
    // Only validate its shape when explicitly provided.
    if (INTEGRITY_KEY && !isHex64(INTEGRITY_KEY)) {
        errors.push('INTEGRITY_KEY, when set, must be exactly 64 hex characters (32 bytes). Generate with `openssl rand -hex 32`.');
    }
    if (!INTEGRITY_KEY && !ENCRYPTION_KEY && !allowPlaintext) {
        // Already covered by the ENCRYPTION_KEY error above, but make the
        // timesheet-integrity consequence explicit.
        errors.push('Neither INTEGRITY_KEY nor ENCRYPTION_KEY is set — timesheet signature integrity hashing cannot run.');
    }

    if (errors.length > 0) {
        console.error('\n=== FATAL: environment validation failed ===');
        for (const e of errors) console.error('• ' + e);
        console.error('===========================================\n');
        process.exit(1);
    }
}

module.exports = { validateEnv, isHex64 };
