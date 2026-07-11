const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { seedAgencyDefaults } = require('../../prisma/seedAgencyDefaults');
const audit = require('../services/auditService');
const { runWithTenant } = require('../lib/tenantContext');
const { JWT_SECRET } = require('../config/secrets');

// Platform routes run before tenantMiddleware (superadmin accounts have no
// agencyId), so there's no ambient tenant context for auditService's
// getAgencyId() to read. Every audit entry here concerns a specific agency
// (the one being created/suspended/impersonated), so wrap the fire-and-forget
// call in a scoped runWithTenant just to stamp that agencyId — same pattern
// authController.js uses for pre-tenant-context audit calls (e.g. login).
function auditForAgency(agencyId, fields) {
  runWithTenant({ agencyId, db: null }, () => {
    audit.logAction(fields);
  });
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'app', 'platform', 'employee']);

async function listAgencies(req, res, next) {
  try {
    const agencies = await prisma.agency.findMany({ orderBy: { createdAt: 'asc' } });
    const enriched = await Promise.all(agencies.map(async (a) => ({
      ...a,
      userCount: await prisma.user.count({ where: { agencyId: a.id } }),
      clientCount: await prisma.client.count({ where: { agencyId: a.id, archivedAt: null } }),
    })));
    res.json(enriched);
  } catch (err) { next(err); }
}

async function createAgency(req, res, next) {
  try {
    const { name, slug, adminEmail, adminName } = req.body;
    if (!name || !slug || !adminEmail || !adminName) {
      return res.status(400).json({ error: 'name, slug, adminEmail and adminName are required' });
    }
    const cleanSlug = String(slug).toLowerCase().trim();
    if (!SLUG_RE.test(cleanSlug) || RESERVED_SLUGS.has(cleanSlug)) {
      return res.status(400).json({ error: 'Invalid slug: lowercase letters, digits and hyphens only' });
    }
    const existing = await prisma.agency.findUnique({ where: { slug: cleanSlug } });
    if (existing) return res.status(409).json({ error: 'An agency with this slug already exists' });

    const agency = await prisma.agency.create({ data: { name: name.trim(), slug: cleanSlug } });
    await seedAgencyDefaults(prisma, agency.id);
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const admin = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(tempPassword, 10),
        name: adminName.trim(),
        role: 'admin',
        agencyId: agency.id,
      },
    });
    auditForAgency(agency.id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Agency', entityId: agency.id, entityName: agency.name, metadata: { slug: cleanSlug, adminEmail: admin.email } });
    res.status(201).json({ agency, admin: { id: admin.id, email: admin.email } });
  } catch (err) { next(err); }
}

function setAgencyStatus(status) {
  return async function handler(req, res, next) {
    try {
      const id = Number(req.params.id);
      const agency = await prisma.agency.findUnique({ where: { id } });
      if (!agency) return res.status(404).json({ error: 'Agency not found' });
      const updated = await prisma.agency.update({ where: { id }, data: { status } });
      const { clearAgencyCache } = require('../middleware/resolveAgency');
      clearAgencyCache();
      auditForAgency(id, { userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: status === 'active' ? 'RESTORE' : 'ARCHIVE', entityType: 'Agency', entityId: id, entityName: agency.name, metadata: { status } });
      res.json(updated);
    } catch (err) { next(err); }
  };
}

async function impersonate(req, res, next) {
  try {
    const agencyId = Number(req.params.id);
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    const target = req.body.userId
      ? await prisma.user.findFirst({ where: { id: Number(req.body.userId), agencyId } })
      : await prisma.user.findFirst({ where: { agencyId, role: 'admin', archivedAt: null, active: true }, orderBy: { id: 'asc' } });
    if (!target) return res.status(404).json({ error: 'No active admin found for this agency' });
    const token = jwt.sign(
      {
        id: target.id, email: target.email, name: target.name, role: target.role,
        permissionGroupId: target.permissionGroupId ?? null, permissions: [],
        permissionsVersion: target.permissionsVersion ?? 1,
        agencyId, agencySlug: agency.slug,
        impersonatorId: req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );
    auditForAgency(agencyId, { userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Agency', entityId: agencyId, entityName: agency.name, metadata: { action: 'impersonation_started', targetUserId: target.id, targetEmail: target.email } });
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    res.json({ token, subdomainUrl: `${proto}://${agency.slug}.${process.env.BASE_DOMAIN || 'localhost'}` });
  } catch (err) { next(err); }
}

module.exports = { listAgencies, createAgency, suspendAgency: setAgencyStatus('suspended'), reactivateAgency: setAgencyStatus('active'), impersonate };
