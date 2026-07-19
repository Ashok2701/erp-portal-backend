"use strict";
const jwt    = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db     = require("../config/db");

const UserModel        = require("../models/user.model");
const RoleModel        = require("../models/role.model");
const ModuleModel      = require("../models/module.model");
const PortalGrantModel = require("../models/portalGrant.model");

// ── Helpers ───────────────────────────────────────────────────
function resolvePartnerContext(user) {
  if (!user.partner_id) return {};
  return {
    partner_id:            user.partner_id,
    partner_name:          user.partner_name,
    partner_slug:          user.partner_slug,
    partner_plan:          user.partner_plan,
    partner_app_name:      user.partner_app_name,
    partner_primary_color: user.partner_primary_color,
    partner_currency:      user.partner_currency,
    partner_language:      user.partner_language,
    partner_unit:          user.partner_unit,
  };
}

/**
 * Resolve which portal type is active on login.
 * Priority: default_role field → first available portal → CUSTOMER fallback
 */
function resolveDefaultPortal(portals, defaultRole) {
  if (!portals.length) return "CUSTOMER";

  // Map default_role field to portal type
  const roleToPortal = {
    "Customer":     "CUSTOMER",
    "B2B Customer": "CONSIGNMENT",
    "Supplier":     "SUPPLIER",
    "Administrator":"CUSTOMER",  // admins default to customer view
  };

  if (defaultRole && roleToPortal[defaultRole]) {
    const preferred = roleToPortal[defaultRole];
    if (portals.find(p => p.portal_type === preferred)) return preferred;
  }

  // Fall back to first available
  return portals[0].portal_type;
}

// ── LOGIN ────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { username, password } = req.body;

  const user = await UserModel.findByUsername(username);
  if (!user)
    return res.status(401).json({ message: "User doesn't exist" });

  if (!user.is_active && user.status !== "IN_VERIFICATION" && user.status !== "PENDING_APPROVAL")
    return res.status(401).json({ message: "User is inactive" });
  if (user.status === "PENDING_REVIEW")
    return res.status(401).json({ message: "Your account is pending review. Please wait for admin approval." });
  if (user.status === "REJECTED")
    return res.status(401).json({ message: "Your account has been rejected. Please contact support." });

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid)
    return res.status(401).json({ message: "Invalid credentials" });

  const roles     = await RoleModel.getRolesByUserId(user.user_id);
  const roleName  = roles.length > 0 ? roles[0].role_name : (user.requested_role || "Customer");
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";

  const system_role = user.system_role || (user.is_super_admin ? "owner" : "tenant_user");

  const displayRole = system_role === "owner"       ? "Owner"
                    : system_role === "partner_user" ? "Partner"
                    : roleName || "Customer";

  // ── Portal access (tenant users only) ────────────────────
  let portals      = [];
  let activePortal = null;

  if (system_role === "tenant_user" && user.tenant_id) {
    portals      = await PortalGrantModel.getUserPortalAccess(user.user_id, user.tenant_id);
    activePortal = resolveDefaultPortal(portals, user.default_role);
  }

  const partnerContext = resolvePartnerContext(user);

  const token = jwt.sign(
    { user_id: user.user_id, tenant_id: user.tenant_id, role: displayRole },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  // Active portal ERP context
  const activePortalData = portals.find(p => p.portal_type === activePortal) || {};

  res.json({
    token,
    user: {
      user_id:           user.user_id,
      tenant_id:         user.tenant_id,
      username:          user.username,
      full_name:         user.full_name,
      email:             user.email,
      role:              displayRole,
      status:            user.status || "ACTIVE",
      portal_mode:       user.portal_mode || "b2c",
      is_super_admin:    user.is_super_admin || false,
      system_role,
      default_role:      user.default_role,
      // Portal switching
      portals,                              // all portals this user can access
      active_portal:     activePortal,      // which portal loads first
      // ERP context for active portal
      erp_entity_type:   activePortalData.erp_entity_type || user.erp_entity_type,
      erp_entity_code:   activePortalData.erp_entity_code || user.erp_entity_code,
      erp_customer_code: activePortalData.erp_entity_type === "customer" ? activePortalData.erp_entity_code : null,
      erp_supplier_code: activePortalData.erp_entity_type === "supplier" ? activePortalData.erp_entity_code : null,
      allowedsite:       activePortalData.allowedsite || user.allowedsite,
      ...partnerContext,
      roles,
    },
  });
};

// ── GET ME ───────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const { user_id, tenant_id, username, role, status,
            portal_mode, is_super_admin, system_role, tenant_slug } = req.user;

    const roles = await RoleModel.getRolesByUserId(user_id);

    const userResult = await db.query(
      `SELECT u.allowedsite, u.erp_entity_type, u.erp_entity_code,
              u.full_name, u.email, u.system_role, u.default_role,
              pu.partner_id,
              p.partner_name, p.slug  AS partner_slug,
              p.plan         AS partner_plan,
              p.app_name     AS partner_app_name,
              p.primary_color AS partner_primary_color,
              p.default_currency AS partner_currency,
              p.default_language AS partner_language,
              p.default_unit     AS partner_unit
       FROM users u
       LEFT JOIN partner_users pu ON pu.user_id = u.user_id AND pu.is_active = true
       LEFT JOIN partners p ON p.partner_id = pu.partner_id
       WHERE u.user_id = $1`,
      [user_id]
    );

    const extra = userResult.rows[0] || {};
    const resolved_system_role = extra.system_role ||
      (is_super_admin ? "owner" : "tenant_user");

    const displayRole = resolved_system_role === "owner"       ? "Owner"
                      : resolved_system_role === "partner_user" ? "Partner"
                      : role || "Customer";

    // Portal access
    let portals      = [];
    let activePortal = null;
    if (resolved_system_role === "tenant_user" && tenant_id) {
      portals      = await PortalGrantModel.getUserPortalAccess(user_id, tenant_id);
      activePortal = resolveDefaultPortal(portals, extra.default_role);
    }

    const activePortalData = portals.find(p => p.portal_type === activePortal) || {};
    const partnerContext   = resolvePartnerContext(extra);

    res.json({
      user_id,
      tenant_id,
      // tenant_slug isn't a users column -- it comes from the tenants table,
      // already resolved once by auth.middleware.js's JOIN and attached to
      // req.user. The query above previously (wrongly) selected u.tenant_slug
      // directly, which doesn't exist and made every /auth/me call 500.
      tenant_slug:       tenant_slug,
      username,
      full_name:         extra.full_name,
      email:             extra.email,
      role:              displayRole,
      status,
      portal_mode:       portal_mode || "b2c",
      is_super_admin:    is_super_admin || false,
      system_role:       resolved_system_role,
      default_role:      extra.default_role,
      // Portal switching
      portals,
      active_portal:     activePortal,
      // ERP context
      erp_entity_type:   activePortalData.erp_entity_type || extra.erp_entity_type,
      erp_entity_code:   activePortalData.erp_entity_code || extra.erp_entity_code,
      erp_customer_code: activePortalData.erp_entity_type === "customer" ? activePortalData.erp_entity_code : null,
      erp_supplier_code: activePortalData.erp_entity_type === "supplier" ? activePortalData.erp_entity_code : null,
      allowedsite:       activePortalData.allowedsite || extra.allowedsite,
      ...partnerContext,
      roles,
    });
  } catch (err) {
    console.error("GET ME ERROR:", err);
    res.status(500).json({ message: "Failed to load user info" });
  }
};

// ── GET MODULES (portal-aware) ───────────────────────────────
exports.getModules = async (req, res) => {
  try {
    const { user_id, tenant_id, system_role } = req.user;

    // Owner + partner → no portal filtering
    if (system_role === "owner" || system_role === "partner_user") {
      const modules = await ModuleModel.getModulesByUserId(user_id);
      return res.json({ modules });
    }

    // For tenant users: check if portal type passed as query param
    const portalType = req.query.portal;
    if (portalType && tenant_id) {
      const modules = await PortalGrantModel.getModulesForPortal(portalType, tenant_id);
      return res.json({ modules });
    }

    // Default: return all modules user has access to
    const modules = await ModuleModel.getModulesByUserId(user_id);
    res.json({ modules });
  } catch (err) {
    console.error("GET MODULES ERROR:", err);
    res.status(500).json({ message: "Failed to load modules" });
  }
};
