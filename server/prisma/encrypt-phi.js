// One-time (idempotent) migration: encrypt existing plaintext PHI at rest.
// Uses the RAW prisma client — the extended client would decrypt on read and
// re-encrypt on write, hiding which rows are actually still plaintext.
//
// Usage: cd server && node prisma/encrypt-phi.js   (or npm run db:encrypt-phi)
// Safe to re-run: already-encrypted values are detected by format and skipped.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const prismaBase = require('../src/lib/prismaBase');
const { encrypt } = require('../src/services/encryptionService');
const { PHI_FIELDS, CIPHERTEXT_RE } = require('../src/lib/phiCrypto');

const MODEL_ACCESSORS = { Client: 'client', Employee: 'employee', HospitalVisit: 'hospitalVisit' };
const BATCH = 200;

async function encryptModel(modelName) {
    const accessor = MODEL_ACCESSORS[modelName];
    const fields = PHI_FIELDS[modelName];
    let cursor = 0;
    let encrypted = 0;
    let skipped = 0;

    for (;;) {
        const rows = await prismaBase[accessor].findMany({
            where: { id: { gt: cursor } },
            orderBy: { id: 'asc' },
            take: BATCH,
            select: fields.reduce((sel, f) => ({ ...sel, [f]: true }), { id: true }),
        });
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1].id;

        for (const row of rows) {
            const data = {};
            for (const f of fields) {
                const val = row[f];
                if (typeof val !== 'string' || val === '' || CIPHERTEXT_RE.test(val)) continue;
                data[f] = encrypt(val);
            }
            if (Object.keys(data).length > 0) {
                await prismaBase[accessor].update({ where: { id: row.id }, data });
                encrypted++;
            } else {
                skipped++;
            }
        }
    }
    console.log(`${modelName}: encrypted ${encrypted} rows, ${skipped} already encrypted or empty`);
    return encrypted;
}

async function main() {
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
        console.error('ENCRYPTION_KEY must be set (64 hex chars). Aborting — nothing was changed.');
        process.exit(1);
    }
    let total = 0;
    for (const model of Object.keys(PHI_FIELDS)) {
        total += await encryptModel(model);
    }
    console.log(`Done. ${total} rows encrypted.`);
}

main()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prismaBase.$disconnect());
