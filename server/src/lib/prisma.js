const prismaBase = require('./prismaBase');
const { encryptWriteArgs, decryptDeep } = require('./phiCrypto');

// PHI-transparent Prisma client: encrypts PHI fields (see phiCrypto.PHI_FIELDS)
// on write and decrypts them on read — including when they arrive through
// nested includes from other models. Raw queries ($queryRawUnsafe etc.) are
// NOT intercepted, so the backup export intentionally emits ciphertext.
const prisma = prismaBase.$extends({
    query: {
        $allModels: {
            async $allOperations({ model, args, query }) {
                encryptWriteArgs(model, args);
                const result = await query(args);
                return decryptDeep(result);
            },
        },
    },
});

module.exports = prisma;
