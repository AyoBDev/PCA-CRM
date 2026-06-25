function requirePermission(permKey) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.role === 'admin') return next();
    if (user.role === 'pca')   return next();
    if (user.role !== 'user')  return res.status(403).json({ error: 'Forbidden', missingPermission: permKey });
    if (user.permissionGroupId == null) return next();
    if (Array.isArray(user.permissions) && user.permissions.includes(permKey)) return next();
    return res.status(403).json({ error: 'Forbidden', missingPermission: permKey });
  };
}

module.exports = { requirePermission };
