const { PrismaClient } = require('@prisma/client');
const { phiQueryExtension } = require('./phiCrypto');

// Tenant traffic connects as app_user (no BYPASSRLS). Falls back to
// DATABASE_URL so local dev works before APP_DATABASE_URL is provisioned —
// RLS is then only enforced in environments that set it.
const appUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const basePrisma = new PrismaClient({ datasourceUrl: appUrl });

// PHI-transparent layer, applied FIRST (innermost) so it wraps the actual DB
// call the same way lib/prisma.js (the owner client) does. Without this,
// tenant-scoped traffic — i.e. all normal app usage — would read/write PHI
// fields in plaintext, silently defeating PHI-at-rest encryption for every
// request except the handful of owner-connection allowlisted paths.
const phiBase = basePrisma.$extends(phiQueryExtension);

// Models without an agencyId column — never stamp these.
const NO_STAMP_MODELS = new Set(['Agency']);
const clientCache = new Map();

function assertAgencyId(agencyId) {
  if (!Number.isInteger(agencyId) || agencyId <= 0) {
    throw new Error(`tenantClient requires a positive integer agencyId, got: ${agencyId}`);
  }
}

function stampCreateArgs(model, operation, args, agencyId) {
  if (NO_STAMP_MODELS.has(model)) return args;
  if (operation === 'create' || operation === 'createMany') {
    if (Array.isArray(args.data)) {
      args.data = args.data.map((d) => ({ agencyId, ...d }));
    } else if (args.data) {
      args.data = { agencyId, ...args.data };
    }
  } else if (operation === 'upsert' && args.create) {
    args.create = { agencyId, ...args.create };
  }
  return args;
}

function scoped(agencyId, promise) {
  // Batch transaction: set the GUC, then run the operation on the same
  // connection. SET ... LOCAL semantics via set_config(..., TRUE).
  return basePrisma
    .$transaction([
      basePrisma.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyId)}, TRUE)`,
      promise,
    ])
    .then(([, result]) => result);
}

// RLS-scoping layer, applied SECOND (outermost). Composition order matters:
// $allOperations here calls `query(...)`, which invokes the PHI layer's
// $allOperations underneath it, which finally calls the real DB operation.
// So for a write: this layer stamps agencyId -> PHI layer encrypts -> DB call.
// For a read: DB call -> PHI layer decrypts -> this layer's `scoped()` just
// passes the (already-decrypted) result through the set_config transaction.
// Extending phiBase (not basePrisma) is what makes tenant-scoped traffic
// PHI-transparent — see the comment on phiBase above.
function tenantClient(agencyId) {
  assertAgencyId(agencyId);
  if (clientCache.has(agencyId)) return clientCache.get(agencyId);
  const client = phiBase.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return scoped(agencyId, query(stampCreateArgs(model, operation, args, agencyId)));
        },
      },
      $queryRaw({ args, query }) {
        return scoped(agencyId, query(args));
      },
      $executeRaw({ args, query }) {
        return scoped(agencyId, query(args));
      },
      $queryRawUnsafe() {
        throw new Error('$queryRawUnsafe is not allowed on tenant clients — use $queryRaw (tagged template) or tenantTransaction');
      },
      $executeRawUnsafe() {
        throw new Error('$executeRawUnsafe is not allowed on tenant clients — use $executeRaw (tagged template) or tenantTransaction');
      },
    },
  });
  clientCache.set(agencyId, client);
  return client;
}

function tenantTransaction(agencyId, fn) {
  assertAgencyId(agencyId);
  return phiBase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyId)}, TRUE)`;
    return fn(tx);
  });
}

module.exports = { tenantClient, tenantTransaction, basePrisma };
