const { encrypt, decrypt } = require('../services/encryptionService');

// PHI fields encrypted at rest, keyed by Prisma model name (as passed to
// query extensions). These columns are never used in where/orderBy/unique
// constraints, so ciphertext at rest is query-safe.
const PHI_FIELDS = {
    Client: ['medicaidId', 'dob', 'notes', 'pcaNotes'],
    Employee: ['dob', 'notes', 'ssn'],
    HospitalVisit: ['providerName', 'location', 'purpose', 'notes'],
};

// Matches the iv:authTag:ciphertext hex format produced by encryptionService.
// Plaintext passes through untouched, which makes mixed plaintext/ciphertext
// state safe during rollout (before the one-time encrypt-phi migration runs).
const CIPHERTEXT_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/;

let warnedNoKey = false;
function hasKey() {
    const hex = process.env.ENCRYPTION_KEY;
    return Boolean(hex && hex.length === 64);
}

function encryptValue(value) {
    if (typeof value !== 'string' || value === '') return value;
    if (CIPHERTEXT_RE.test(value)) return value; // already encrypted — never double-encrypt
    if (!hasKey()) {
        // Boot-time validateEnv() already refuses to start without a key unless
        // ALLOW_PLAINTEXT_PHI=true. Reaching here therefore means the operator
        // explicitly opted into plaintext (local dev only). Do NOT gate on
        // NODE_ENV — Railway often leaves it unset, which previously let a
        // real deploy silently store plaintext.
        if (process.env.ALLOW_PLAINTEXT_PHI !== 'true') {
            throw new Error('ENCRYPTION_KEY must be set to write PHI fields (set ALLOW_PLAINTEXT_PHI=true only for local dev)');
        }
        if (!warnedNoKey) {
            warnedNoKey = true;
            console.warn('[phiCrypto] ALLOW_PLAINTEXT_PHI=true — PHI fields are being stored in PLAINTEXT (dev only)');
        }
        return value;
    }
    return encrypt(value);
}

function decryptValue(value) {
    try {
        return decrypt(value);
    } catch (err) {
        console.error('[phiCrypto] Failed to decrypt PHI value:', err.message);
        return '[decryption failed]';
    }
}

function encryptRecord(record, fields) {
    if (!record || typeof record !== 'object') return;
    for (const field of fields) {
        if (typeof record[field] === 'string') record[field] = encryptValue(record[field]);
    }
}

// Encrypt PHI fields in write args for create/update/upsert/createMany/
// updateMany. Mutates args in place. Nested writes into PHI models are not
// used in this codebase; top-level data objects are the write surface.
function encryptWriteArgs(model, args) {
    const fields = PHI_FIELDS[model];
    if (!fields || !args) return args;
    for (const key of ['data', 'create', 'update']) {
        const target = args[key];
        if (Array.isArray(target)) target.forEach(r => encryptRecord(r, fields));
        else if (target) encryptRecord(target, fields);
    }
    return args;
}

// Recursively walk a query result and decrypt every string matching the
// ciphertext format. Walking the whole result (rather than per-model fields)
// means nested includes — e.g. timesheet.client, client.hospitalVisits — are
// decrypted no matter which model the query started from.
function decryptDeep(value) {
    if (value == null) return value;
    if (typeof value === 'string') {
        return CIPHERTEXT_RE.test(value) ? decryptValue(value) : value;
    }
    if (typeof value !== 'object') return value;
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = decryptDeep(value[i]);
        return value;
    }
    if (typeof value.toJSON === 'function' && !(value instanceof Date)) return value; // Decimal etc.
    for (const key of Object.keys(value)) {
        value[key] = decryptDeep(value[key]);
    }
    return value;
}

// Shared Prisma query-extension config: encrypts PHI fields on write and
// deep-decrypts every result. Both the owner client (lib/prisma.js) and the
// tenant client (lib/tenantPrisma.js) apply this SAME extension so PHI is
// never stored or returned in plaintext regardless of which connection wrote
// or read it. Keeping this definition in one place prevents the two clients'
// crypto behavior from drifting apart.
const phiQueryExtension = {
    query: {
        $allModels: {
            async $allOperations({ model, args, query }) {
                encryptWriteArgs(model, args);
                const result = await query(args);
                return decryptDeep(result);
            },
        },
    },
};

module.exports = { PHI_FIELDS, CIPHERTEXT_RE, encryptWriteArgs, decryptDeep, phiQueryExtension };
