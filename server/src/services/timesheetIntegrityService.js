const crypto = require('crypto');
const { getTenantDb } = require('../lib/tenantContext');

// Fields hashed per entry, per service block. Companion is included with its
// defaults so the PCA path (which never writes companion) and the admin path
// (which does) produce the same canonical shape.
const SERVICE_BLOCKS = ['adl', 'iadl', 'respite', 'companion'];
const BLOCK_FIELDS = ['Activities', 'TimeIn', 'TimeOut', 'TimeBlocks', 'Hours', 'PcaInitials', 'ClientInitials'];

function getIntegrityKey() {
    const hex = process.env.INTEGRITY_KEY;
    if (hex && hex.length === 64) return Buffer.from(hex, 'hex');
    const enc = process.env.ENCRYPTION_KEY;
    if (enc && enc.length === 64) {
        return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(enc, 'hex'), Buffer.alloc(0), 'timesheet-integrity', 32));
    }
    throw new Error('INTEGRITY_KEY (or ENCRYPTION_KEY) must be set: 64 hex chars (32 bytes)');
}

function iso(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    return isNaN(date.getTime()) ? '' : date.toISOString();
}

// Canonical serialization of the values the signatures attest to. Built from
// the PERSISTED timesheet row (not the request body) so the PCA form path and
// the admin path hash identical shapes. Workflow fields (status, submittedAt,
// acceptedAt, correctionNote) are deliberately excluded — they are re-stamped
// by the reject/re-submit workflow without invalidating the signed content.
function buildCanonicalPayload(ts) {
    const entries = [...(ts.entries || [])]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map(e => {
            const out = [['dayOfWeek', e.dayOfWeek], ['dateOfService', e.dateOfService || '']];
            for (const block of SERVICE_BLOCKS) {
                for (const field of BLOCK_FIELDS) {
                    const key = `${block}${field}`;
                    let val = e[key];
                    if (field === 'Hours') val = Number(val) || 0;
                    else if (field === 'Activities') val = val || '{}';
                    else if (field === 'TimeBlocks') val = val || '[]';
                    else val = val || '';
                    out.push([key, val]);
                }
            }
            return out;
        });
    return [
        ['id', ts.id],
        ['clientId', ts.clientId],
        ['pcaName', ts.pcaName || ''],
        ['weekStart', iso(ts.weekStart)],
        ['recipientName', ts.recipientName || ''],
        ['pcaFullName', ts.pcaFullName || ''],
        ['recipientSignature', ts.recipientSignature || ''],
        ['pcaSignature', ts.pcaSignature || ''],
        ['totalPasHours', Number(ts.totalPasHours) || 0],
        ['totalHmHours', Number(ts.totalHmHours) || 0],
        ['totalRespiteHours', Number(ts.totalRespiteHours) || 0],
        ['totalCompanionHours', Number(ts.totalCompanionHours) || 0],
        ['totalHours', Number(ts.totalHours) || 0],
        ['entries', entries],
    ];
}

function hmac(data) {
    return crypto.createHmac('sha256', getIntegrityKey()).update(data).digest('hex');
}

function computeHash(ts) {
    return hmac(JSON.stringify(buildCanonicalPayload(ts)));
}

// Hash of the attesting parties' signatures only. Used to decide whether a
// re-submit represents a fresh attestation (recompute payload hash) or a
// re-stamp of old signatures (keep the old hash so edits surface as tampered).
// The supervisor signature is administrative — it is added by office staff
// after the PCA/recipient sign, so it is excluded here AND from the signed
// payload; otherwise a legitimate supervisor counter-signature would flag the
// timesheet as tampered.
function computeSignaturesHash(ts) {
    return hmac(JSON.stringify([
        ts.pcaSignature || '',
        ts.recipientSignature || '',
        ts.pcaFullName || '',
        ts.recipientName || '',
    ]));
}

// Re-fetch the timesheet from the DB and bind the persisted state to the
// signatures. Hashing persisted values (not the request body) keeps the PCA
// and admin submit paths consistent.
async function computeAndStoreIntegrityHash(timesheetId) {
    const db = getTenantDb();
    const ts = await db.timesheet.findUnique({
        where: { id: timesheetId },
        include: { entries: { orderBy: { dayOfWeek: 'asc' } } },
    });
    if (!ts) return null;
    const signedPayloadHash = computeHash(ts);
    const signaturesHash = computeSignaturesHash(ts);
    await db.timesheet.update({
        where: { id: timesheetId },
        data: { signedPayloadHash, signaturesHash, hashedAt: new Date() },
    });
    return signedPayloadHash;
}

// 'unsigned'  — never hashed (predates the feature, or still a draft)
// 'valid'     — persisted content matches what was signed
// 'tampered'  — content changed after signing
function verifyTimesheetIntegrity(ts) {
    if (!ts.signedPayloadHash) return 'unsigned';
    return computeHash(ts) === ts.signedPayloadHash ? 'valid' : 'tampered';
}

module.exports = {
    buildCanonicalPayload,
    computeHash,
    computeSignaturesHash,
    computeAndStoreIntegrityHash,
    verifyTimesheetIntegrity,
};
