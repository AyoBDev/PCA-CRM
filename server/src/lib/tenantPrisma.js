const { PrismaClient } = require('@prisma/client');

// Tenant traffic connects as app_user (no BYPASSRLS). Falls back to
// DATABASE_URL so local dev works before APP_DATABASE_URL is provisioned —
// RLS is then only enforced in environments that set it.
const appUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const basePrisma = new PrismaClient({ datasourceUrl: appUrl });

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

function tenantClient(agencyId) {
  assertAgencyId(agencyId);
  if (clientCache.has(agencyId)) return clientCache.get(agencyId);
  const client = basePrisma.$extends({
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
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyId)}, TRUE)`;
    return fn(tx);
  });
}

module.exports = { tenantClient, tenantTransaction, basePrisma };
