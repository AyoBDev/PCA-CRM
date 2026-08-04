const KINDS = { DOCUMENT: 'document', CERTIFICATION: 'certification', POLICY: 'policy' };

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

module.exports = { assignRequirements, KINDS };
