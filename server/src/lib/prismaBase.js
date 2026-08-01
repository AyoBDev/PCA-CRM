// Raw, unextended Prisma client. Use ONLY where PHI must stay in its at-rest
// form: the one-time encrypt-phi migration script (needs to see raw values to
// avoid double-encryption) and anything that must export ciphertext verbatim.
// Application code should require './prisma' (the PHI-transparent client).
const { PrismaClient } = require('@prisma/client');

const prismaBase = new PrismaClient();

module.exports = prismaBase;
