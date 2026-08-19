const prisma = require('../lib/prisma');

const KINDS = { DOCUMENT: 'document', CERTIFICATION: 'certification', POLICY: 'policy' };

// Single shared projection of an employee's requirement ledger, joined against
// the relevant catalog table (document/cert/policy) per requirement kind.
// Used by BOTH the token-authenticated onboarding flow and the JWT-authenticated
// employee portal, so there is exactly one place this shape is computed.
async function projectLedger(employeeId) {
  const reqs = await prisma.employeeRequirement.findMany({ where: { employeeId } });
  const [docs, certs, policies, uploaded] = await Promise.all([
    prisma.documentType.findMany(), prisma.certType.findMany(), prisma.policyDocument.findMany(),
    prisma.employeeDocument.findMany({ where: { employeeId }, select: { id: true, fileName: true } }),
  ]);
  const byId = (a) => Object.fromEntries(a.map(x => [x.id, x]));
  const d = byId(docs), c = byId(certs), p = byId(policies), fileById = byId(uploaded);
  return reqs.map(r => {
    const cat = r.kind === 'document' ? d[r.catalogTypeId] : r.kind === 'certification' ? c[r.catalogTypeId] : p[r.catalogTypeId];
    const file = r.documentId ? fileById[r.documentId] : null;
    return {
      id: r.id,
      kind: r.kind,
      catalogTypeId: r.catalogTypeId,
      status: r.status,
      optional: Boolean(r.optional),
      rejectionReason: r.rejectionReason,
      reviewStatus: r.reviewStatus || 'pending',
      label: cat ? (cat.label || cat.title) : '',
      requiresExpiry: cat ? Boolean(cat.requiresExpiry) : false,
      fileName: file ? file.fileName : null,
    };
  });
}

// selections: { documentTypeIds, certTypeIds, certTypeKeys, policyDocumentIds, optional }
// `certTypeKeys` lets a caller assign certs by their catalog key (e.g. 'cpr') without
// knowing DB ids. `optional: true` marks every requirement in this call as non-gating.
async function assignRequirements(tx, employeeId, selections = {}) {
  const { documentTypeIds = [], certTypeIds = [], certTypeKeys = [], policyDocumentIds = [], optional = false } = selections;
  const rows = [];

  for (const catalogTypeId of documentTypeIds) {
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.DOCUMENT, catalogTypeId, status: 'required', optional },
    }));
  }

  // Resolve any cert keys to their catalog rows, then merge with explicit ids.
  const certRows = [];
  for (const id of certTypeIds) {
    const ct = await tx.certType.findUnique({ where: { id } });
    if (ct) certRows.push(ct);
  }
  for (const key of certTypeKeys) {
    const ct = await tx.certType.findUnique({ where: { key } });
    if (ct) certRows.push(ct);
  }
  for (const ct of certRows) {
    const cert = await tx.employeeCertification.create({
      data: { employeeId, certType: ct.key, status: 'required' },
    });
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.CERTIFICATION, catalogTypeId: ct.id, status: 'required', optional, certificationId: cert.id },
    }));
  }

  for (const catalogTypeId of policyDocumentIds) {
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.POLICY, catalogTypeId, status: 'required', optional },
    }));
  }

  return rows;
}

// Decide the reviewStatus write for a (re)fulfillment. A previously-REJECTED
// item must flip back into the review queue ('pending', reason cleared) so the
// changes_requested → rework loop works. But an ALREADY-APPROVED item must NOT
// silently un-approve when an active employee re-uploads/re-acks — that would
// corrupt the review ledger. So: rejected → pending (cleared); approved → left
// untouched; anything else (pending/none) → normalized to pending.
function reviewStatusForRefulfill(current) {
  if (current === 'approved') return {}; // leave approved items alone
  return { reviewStatus: 'pending', rejectionReason: '' };
}

async function markSubmitted(tx, requirementId, fulfillment = {}) {
  const existing = await tx.employeeRequirement.findUnique({ where: { id: requirementId } });
  const data = { status: 'submitted', ...reviewStatusForRefulfill(existing && existing.reviewStatus) };
  if (fulfillment.documentId) data.documentId = fulfillment.documentId;
  if (fulfillment.certificationId) data.certificationId = fulfillment.certificationId;
  return tx.employeeRequirement.update({ where: { id: requirementId }, data });
}

async function markPolicyAck(tx, requirementId, policyAckId) {
  const existing = await tx.employeeRequirement.findUnique({ where: { id: requirementId } });
  return tx.employeeRequirement.update({
    where: { id: requirementId },
    data: { status: 'approved', policyAckId, ...reviewStatusForRefulfill(existing && existing.reviewStatus) },
  });
}

// Flip a previously-rejected requirement back into rework: the employee has
// re-uploaded a document/cert or re-acked a policy, so it should re-enter the
// admin review queue as 'pending' rather than stay stuck 'rejected'.
async function resetItemForRework(tx, requirementId) {
  return tx.employeeRequirement.update({
    where: { id: requirementId },
    data: { reviewStatus: 'pending', status: 'submitted', rejectionReason: '' },
  });
}

function isOnboardingComplete(requirements) {
  return requirements.every(r => {
    if (r.optional) return true; // optional items never block submission
    if (r.kind === 'policy') return r.status === 'approved';
    return r.status === 'submitted' || r.status === 'approved';
  });
}

// Decide the finalize outcome from per-item admin review states.
// `reviewStatus`: 'pending' | 'approved' | 'rejected'. Optional items never block.
function reviewSummary(requirements) {
  const required = requirements.filter(r => !r.optional);
  const rejectedIds = required.filter(r => r.reviewStatus === 'rejected').map(r => r.id);
  const allApproved = required.every(r => r.reviewStatus === 'approved');
  return { outcome: allApproved ? 'approved' : 'changes_requested', rejectedIds };
}

module.exports = { assignRequirements, markSubmitted, markPolicyAck, resetItemForRework, isOnboardingComplete, projectLedger, reviewSummary, KINDS };
