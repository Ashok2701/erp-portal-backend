"use strict";
const db = require("../config/db");

// Portal type → module names mapping (hardcoded for now)
const PORTAL_MODULES = {
  CUSTOMER: [
    "Dashboard", "Products", "Orders", "Invoices", "Payments",
    "Deliveries", "Sales Requests", "Sales Quote", "Credit Notes",
    "Content Management",
  ],
  CONSIGNMENT: [
    "Dashboard", "Available", "Consignment", "In Transit", "Reserved",
    "Stock Requests", "Orders", "Invoices", "Payments",
    "Content Management",
  ],
  SUPPLIER: [
    "Dashboard", "Purchase Requests", "Content Management",
  ],
};

// Portal type → role names mapping
const PORTAL_ROLES = {
  CUSTOMER:    ["Administrator", "Customer"],
  CONSIGNMENT: ["Administrator", "B2B Customer"],
  SUPPLIER:    ["Administrator", "Supplier"],
};

/**
 * Get all portal grants for a tenant
 */
exports.getByTenantId = async (tenantId) => {
  const r = await db.query(
    `SELECT tpg.*, u.username AS granted_by_name
     FROM tenant_portal_grants tpg
     LEFT JOIN users u ON u.user_id = tpg.granted_by
     WHERE tpg.tenant_id = $1
     ORDER BY tpg.portal_type`,
    [tenantId]
  );
  return r.rows;
};

/**
 * Get active portal types for a tenant (just the strings)
 */
exports.getActivePortalTypes = async (tenantId) => {
  const r = await db.query(
    `SELECT portal_type FROM tenant_portal_grants
     WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  return r.rows.map(row => row.portal_type);
};

/**
 * Grant portal types to a tenant.
 * portalTypes = ['CUSTOMER', 'CONSIGNMENT', 'SUPPLIER']
 */
exports.grantPortals = async (tenantId, portalTypes, grantedBy) => {
  for (const pt of portalTypes) {
    await db.query(
      `INSERT INTO tenant_portal_grants (tenant_id, portal_type, is_active, granted_by)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (tenant_id, portal_type)
       DO UPDATE SET is_active = true, granted_by = $3, granted_at = NOW()`,
      [tenantId, pt, grantedBy]
    );
  }
};

/**
 * Revoke a portal type from a tenant
 */
exports.revokePortal = async (tenantId, portalType) => {
  await db.query(
    `UPDATE tenant_portal_grants SET is_active = false
     WHERE tenant_id = $1 AND portal_type = $2`,
    [tenantId, portalType]
  );
};

/**
 * Get all portal grants + ERP mapping for a user
 * Returns: portals the user has access to with their ERP code per portal
 */
exports.getUserPortalAccess = async (userId, tenantId) => {
  // Get portals granted to this tenant
  const grantedPortals = await exports.getActivePortalTypes(tenantId);
  if (!grantedPortals.length) return [];

  // Get user's ERP mapping per portal
  const erpMappings = await db.query(
    `SELECT portal_type, erp_entity_type, erp_entity_code,
            allowedsite, is_default
     FROM user_role_erp_mapping
     WHERE user_id = $1`,
    [userId]
  );
  const erpByPortal = {};
  for (const row of erpMappings.rows) {
    erpByPortal[row.portal_type] = row;
  }

  // Get user's roles - scoped to tenant to avoid cross-tenant role pollution
  const rolesResult = await db.query(
    `SELECT r.role_name FROM user_roles ur
     JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = $1
       AND (r.tenant_id = $2 OR r.tenant_id IS NULL)`,
    [userId, tenantId]
  );
  const userRoleNames = rolesResult.rows.map(r => r.role_name);
  
  // If no roles found via user_roles, check default_role on user record
  if (!userRoleNames.length) {
    const userRecord = await db.query(
      'SELECT default_role FROM users WHERE user_id = $1', [userId]
    );
    if (userRecord.rows[0]?.default_role) {
      userRoleNames.push(userRecord.rows[0].default_role);
    }
  }

  // Build portal access list
  console.log('[portalGrant] userId:', userId, 'tenantId:', tenantId);
  console.log('[portalGrant] grantedPortals:', grantedPortals);
  console.log('[portalGrant] userRoleNames:', userRoleNames);
  console.log('[portalGrant] erpByPortal:', Object.keys(erpByPortal));

  return grantedPortals
    .filter(pt => {
      // User must have at least one role valid for this portal
      const validRoles = PORTAL_ROLES[pt] || [];
      const hasRole = validRoles.some(r => userRoleNames.includes(r));
      console.log('[portalGrant] portal:', pt, 'validRoles:', validRoles, 'hasRole:', hasRole);
      return hasRole;
    })
    .map(pt => ({
      portal_type:     pt,
      erp_entity_type: erpByPortal[pt]?.erp_entity_type || null,
      erp_entity_code: erpByPortal[pt]?.erp_entity_code || null,
      allowedsite:     erpByPortal[pt]?.allowedsite || null,
      is_default:      erpByPortal[pt]?.is_default || false,
    }));
};

/**
 * Get modules for a specific portal type
 */
exports.getModulesForPortal = async (portalType, tenantId) => {
  const moduleNames = PORTAL_MODULES[portalType] || [];
  if (!moduleNames.length) return [];

  const r = await db.query(
    `SELECT m.module_id, m.module_name, m.route_path,
            m.icon_name, m.portal_mode,
            COALESCE(m.sort_order, 99) AS sort_order
     FROM modules m
     WHERE m.module_name = ANY($1)
       AND m.is_active = true
       AND (m.tenant_id IS NULL OR m.tenant_id = $2)
     ORDER BY COALESCE(m.sort_order, 99), m.module_name`,
    [moduleNames, tenantId]
  );
  return r.rows;
};

module.exports.PORTAL_MODULES = PORTAL_MODULES;
module.exports.PORTAL_ROLES   = PORTAL_ROLES;
