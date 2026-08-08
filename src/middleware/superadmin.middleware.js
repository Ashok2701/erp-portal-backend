"use strict";

// Allows: is_super_admin (legacy) OR system_role === 'owner' OR system_role === 'partner_user'
// This lets both Owner and Partner users access tenant management routes.
// Individual controllers further scope what each role can see/do.
//
// Note: on-premise seeds a tenant-scoped Administrator with is_super_admin =
// true (system_role stays 'tenant_user') so AdminSettings/UsersPage can
// reuse this same tenant-config API surface for their own tenant. That
// means this gate alone is NOT tenant isolation for that user type -- every
// :id/:userId-based controller below must (and now does) additionally check
// req.user.tenant_id against the tenant the request targets.
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
