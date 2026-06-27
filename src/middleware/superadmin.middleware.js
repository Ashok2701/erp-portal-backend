"use strict";

// Allows: is_super_admin (legacy) OR system_role === 'owner' OR system_role === 'partner_user'
// This lets both Owner and Partner users access tenant management routes.
// Individual controllers further scope what each role can see/do.
module.exports = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const { is_super_admin, system_role } = req.user;

  const allowed = is_super_admin ||
    system_role === "owner" ||
    system_role === "partner_user";

  if (!allowed)
    return res.status(403).json({ message: "SuperAdmin access required" });

  next();
};
