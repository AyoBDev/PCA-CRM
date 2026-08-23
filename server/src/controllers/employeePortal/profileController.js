const audit = require('../../services/auditService');

// Fields a logged-in employee may read/edit on their own profile. `ssn` is
// intentionally excluded — it is PHI captured once during onboarding and must
// not be editable from the self-service profile.
const PROFILE_SELECT = {
  id: true, name: true, phone: true, email: true, address: true,
  dob: true, gender: true, preferredLanguage: true,
  emergencyContactName: true, emergencyContactRelationship: true,
  emergencyContactPhone: true, emergencyContactEmail: true,
  firstAssignmentDate: true, complianceStatus: true,
};

async function getProfile(req, res) {
  const emp = await req.db.employee.findUnique({
    where: { id: req.employee.id },
    select: PROFILE_SELECT,
  });
  res.json(emp);
}

async function updateProfile(req, res) {
  const {
    name, phone, email, address, dob, gender, preferredLanguage,
    emergencyContactName, emergencyContactRelationship,
    emergencyContactPhone, emergencyContactEmail,
  } = req.body;
  const data = {
    ...(name !== undefined && { name }),
    ...(phone !== undefined && { phone }),
    ...(email !== undefined && { email }),
    ...(address !== undefined && { address }),
    ...(dob !== undefined && { dob }),
    ...(gender !== undefined && { gender }),
    ...(preferredLanguage !== undefined && { preferredLanguage }),
    ...(emergencyContactName !== undefined && { emergencyContactName }),
    ...(emergencyContactRelationship !== undefined && { emergencyContactRelationship }),
    ...(emergencyContactPhone !== undefined && { emergencyContactPhone }),
    ...(emergencyContactEmail !== undefined && { emergencyContactEmail }),
  };
  const updated = await req.db.employee.update({
    where: { id: req.employee.id },
    data,
    select: PROFILE_SELECT,
  });
  // Log which fields changed, never PHI values (dob is encrypted at rest).
  audit.logAction({
    userId: req.user.id, userName: req.user.name || updated.name, userRole: req.user.role || 'pca',
    action: 'UPDATE', entityType: 'Employee', entityId: updated.id, entityName: updated.name,
    metadata: { action: 'profile_self_update', fields: Object.keys(data) },
  });
  res.json(updated);
}

module.exports = { getProfile, updateProfile };
