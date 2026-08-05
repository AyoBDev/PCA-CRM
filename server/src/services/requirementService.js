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
      rejectionReason: r.rejectionReason,
      label: cat ? (cat.label || cat.title) : '',
      requiresExpiry: cat ? Boolean(cat.requiresExpiry) : false,
      fileName: file ? file.fileName : null,
    };
  });
}

async function assignRequirements(tx, employeeId, selections = {}) {
  const { documentTypeIds = [], certTypeIds = [], policyDocumentIds = [] } = selections;
  const rows = [];

  for (const catalogTypeId of documentTypeIds) {
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.DOCUMENT, catalogTypeId, status: 'required' },
    }));
  }

  for (const catalogTypeId of certTypeIds) {
    const certType = await tx.certType.findUnique({ where: { id: catalogTypeId } });
    const cert = await tx.employeeCertification.create({
      data: { employeeId, certType: certType ? certType.key : String(catalogTypeId), status: 'required' },
    });
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.CERTIFICATION, catalogTypeId, status: 'required', certificationId: cert.id },
    }));
  }

  for (const catalogTypeId of policyDocumentIds) {
    rows.push(await tx.employeeRequirement.create({
      data: { employeeId, kind: KINDS.POLICY, catalogTypeId, status: 'required' },
    }));
  }

  return rows;
}

async function markSubmitted(tx, requirementId, fulfillment = {}) {
  const data = { status: 'submitted' };
  if (fulfillment.documentId) data.documentId = fulfillment.documentId;
  if (fulfillment.certificationId) data.certificationId = fulfillment.certificationId;
  return tx.employeeRequirement.update({ where: { id: requirementId }, data });
}

async function markPolicyAck(tx, requirementId, policyAckId) {
  return tx.employeeRequirement.update({
    where: { id: requirementId },
    data: { status: 'approved', policyAckId },
  });
}

function isOnboardingComplete(requirements) {
  return requirements.every(r => {
    if (r.kind === 'policy') return r.status === 'approved';
    return r.status === 'submitted' || r.status === 'approved';
  });
}

module.exports = { assignRequirements, markSubmitted, markPolicyAck, isOnboardingComplete, projectLedger, KINDS };
