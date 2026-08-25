const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

function runWithTenant(store, fn) {
  return als.run(store, fn);
}

function getTenant() {
  return als.getStore() || null;
}

function getTenantDb() {
  const store = als.getStore();
  if (!store || !store.db) throw new Error('No tenant context');
  return store.db;
}

function getAgencyId() {
  return als.getStore()?.agencyId ?? null;
}

function getImpersonatorId() {
  return als.getStore()?.impersonatorId ?? null;
}

module.exports = { runWithTenant, getTenant, getTenantDb, getAgencyId, getImpersonatorId };
