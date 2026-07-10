const audit = require('../services/auditService');
const { enrichClient } = require('../services/authorizationService');
const leadService = require('../services/leadService');

const WORKFLOW_STATUSES = ['new', 'review', 'waiting_insurance', 'waiting_docs', 'quoted', 'pending_start', 'archived'];
const COLUMN_IDS = leadService.LEAD_COLUMNS.map(c => c.id);

function leadName(lead) {
  return `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Lead';
}

async function listLeads(req, res, next) {
  try {
    const where = req.query.archived === 'true' ? { archivedAt: { not: null }, status: { not: 'converted' } } : { archivedAt: null };
    const leads = await req.db.lead.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(leads);
  } catch (err) { next(err); }
}

async function getLead(req, res, next) {
  try {
    const lead = await req.db.lead.findUnique({ where: { id: Number(req.params.id) } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) { next(err); }
}

function sanitizeLeadBody(body) {
  // Whitelist only Lead columns; convert date strings.
  const b = { ...body };
  ['dob', 'expectedStartDate', 'followUpDate'].forEach(k => { b[k] = b[k] ? new Date(b[k]) : null; });
  delete b.id; delete b.createdAt; delete b.updatedAt; delete b.convertedClientId; delete b.convertedAt; delete b.archivedAt;
  return b;
}

async function createLead(req, res, next) {
  try {
    const { firstName, lastName } = req.body;
    if (!(firstName || '').trim() && !(lastName || '').trim()) {
      return res.status(400).json({ error: 'firstName or lastName is required' });
    }
    const lead = await req.db.lead.create({ data: sanitizeLeadBody(req.body) });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Lead', entityId: lead.id, entityName: leadName(lead) });
    res.status(201).json(lead);
  } catch (err) { next(err); }
}

async function updateLead(req, res, next) {
  try {
    const id = Number(req.params.id);
    const lead = await req.db.lead.update({ where: { id }, data: sanitizeLeadBody(req.body) });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Lead', entityId: id, entityName: leadName(lead) });
    res.json(lead);
  } catch (err) { next(err); }
}

async function setLeadStatus(req, res, next) {
  try {
    const id = Number(req.params.id);
    let { status } = req.body;
    if (COLUMN_IDS.includes(status)) status = leadService.columnToStatus(status);
    if (!WORKFLOW_STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
    const existing = await req.db.lead.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Lead not found' });
    const data = { status, archivedAt: status === 'archived' ? new Date() : null };
    const lead = await req.db.lead.update({ where: { id }, data });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Lead', entityId: id, entityName: leadName(lead), changes: [{ field: 'status', oldValue: existing.status, newValue: status }] });
    res.json(lead);
  } catch (err) { next(err); }
}

async function archiveLead(req, res, next) {
  try {
    const id = Number(req.params.id);
    const lead = await req.db.lead.update({ where: { id }, data: { status: 'archived', archivedAt: new Date() } });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'ARCHIVE', entityType: 'Lead', entityId: id, entityName: leadName(lead) });
    res.json(lead);
  } catch (err) { next(err); }
}

async function restoreLead(req, res, next) {
  try {
    const id = Number(req.params.id);
    const lead = await req.db.lead.update({ where: { id }, data: { status: 'new', archivedAt: null } });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'RESTORE', entityType: 'Lead', entityId: id, entityName: leadName(lead) });
    res.json(lead);
  } catch (err) { next(err); }
}

async function convertLead(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { client, lead } = await leadService.convertLead(req.db, req.user.agencyId, id);
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Client', entityId: client.id, entityName: client.clientName });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Lead', entityId: id, entityName: leadName(lead), metadata: { action: 'lead_converted', clientId: client.id } });
    res.json({ client: enrichClient(client), lead });
  } catch (err) {
    if (/not found|already converted/i.test(err.message)) return res.status(400).json({ error: err.message });
    next(err);
  }
}

async function getLeadStats(req, res, next) {
  try {
    const leads = await req.db.lead.findMany();
    res.json(leadService.computeStats(leads, new Date()));
  } catch (err) { next(err); }
}

module.exports = { listLeads, getLead, createLead, updateLead, setLeadStatus, archiveLead, restoreLead, convertLead, getLeadStats };
