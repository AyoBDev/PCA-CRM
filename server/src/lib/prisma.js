const prismaBase = require('./prismaBase');
const { phiQueryExtension } = require('./phiCrypto');

// PHI-transparent Prisma client: encrypts PHI fields (see phiCrypto.PHI_FIELDS)
// on write and decrypts them on read — including when they arrive through
// nested includes from other models. Raw queries ($queryRawUnsafe etc.) are
// NOT intercepted, so the backup export intentionally emits ciphertext.
//
// The extension itself lives in phiCrypto.phiQueryExtension so this owner
// client and the tenant client (lib/tenantPrisma.js) apply IDENTICAL crypto
// behavior — see that file for why the tenant client also needs this layer.
const prisma = prismaBase.$extends(phiQueryExtension);

module.exports = prisma;
