"use strict";
const Joi = require("joi");

// ── Generic validation middleware factory ─────────────────────
// Usage: router.post("/route", validate(schemas.createTenant), ctrl.create)
const validate = (schema, target = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly:   false,   // return ALL errors, not just first
      stripUnknown: true,    // remove unknown fields silently
      convert:      true,    // coerce types (e.g. "1433" → 1433)
    });

    if (error) {
      const messages = error.details.map(d => d.message).join("; ");
      return res.status(400).json({ success: false, message: messages });
    }

    // Replace req.body/params/query with cleaned/coerced value
    req[target] = value;
    next();
  };
};

// ── Shared field definitions ──────────────────────────────────
const f = {
  uuid:     Joi.string().uuid({ version: "uuidv4" }),
  str:      (max = 200) => Joi.string().trim().max(max),
  username: Joi.string().trim().pattern(/^[a-zA-Z0-9._-]+$/).max(50).messages({ 'string.pattern.base': 'Username can only contain letters, numbers, dots, hyphens and underscores (no spaces)' }),
  email:    Joi.string().email({ tlds: { allow: false } }).trim().lowercase(),
  password: Joi.string().min(8).max(128),
  slug:     Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).max(100),
  port:     Joi.number().integer().min(1).max(65535),
  bool:     Joi.boolean(),
  uuid_opt: Joi.string().uuid({ version: "uuidv4" }).optional().allow(null, ""),
};

// ── Schemas ───────────────────────────────────────────────────
const schemas = {

  // AUTH
  login: Joi.object({
    username: f.str().required(),
    password: f.str(128).required(),
  }),

  forgotPassword: Joi.object({
    email:    f.email.optional(),
    username: f.str().optional(),
  }).or("email", "username"),

  resetPassword: Joi.object({
    token:        f.str(500).required(),
    new_password: f.password.required(),
  }),

  // SIGNUP
  signup: Joi.object({
    username:        f.username.required(),
    email:           f.email.required(),
    full_name:       f.str().required(),
    password:        f.password.required(),
    contact_number:  f.str(30).optional().allow("", null),
    whatsapp_number: f.str(30).optional().allow("", null),
    country_code:    f.str(10).optional().allow("", null),
    erp_entity_type: Joi.string().valid("customer", "supplier", "none").optional(),
    erp_entity_code: f.str(50).optional().allow("", null),
    allowedsite:     f.str(500).optional().allow("", null),
    portal_mode:     Joi.string().valid("b2b", "b2c", "both").optional(),
    tenant_id:       f.uuid_opt,
    requested_role:  f.str(50).optional().allow("", null),
  }),

  // PARTNERS
  createPartner: Joi.object({
    partner_name:     f.str().required(),
    slug:             f.slug.required(),
    email:            f.email.optional().allow("", null),
    phone:            f.str(30).optional().allow("", null),
    plan:             Joi.string().valid("starter", "pro", "enterprise").default("starter"),
    max_tenants:      Joi.number().integer().min(1).max(1000).default(10),
    logo_url:         f.str(500).optional().allow("", null),
    app_name:         f.str().optional().allow("", null),
    primary_color:    f.str(20).optional().allow("", null),
    default_currency: f.str(10).default("USD"),
    default_language: f.str(10).default("en"),
    default_unit:     f.str(20).default("GAL"),
    custom_domain:    f.str().optional().allow("", null),
  }),

  updatePartner: Joi.object({
    partner_name:     f.str().optional(),
    email:            f.email.optional().allow("", null),
    phone:            f.str(30).optional().allow("", null),
    plan:             Joi.string().valid("starter", "pro", "enterprise").optional(),
    max_tenants:      Joi.number().integer().min(1).max(1000).optional(),
    logo_url:         f.str(500).optional().allow("", null),
    app_name:         f.str().optional().allow("", null),
    primary_color:    f.str(20).optional().allow("", null),
    default_currency: f.str(10).optional(),
    default_language: f.str(10).optional(),
    default_unit:     f.str(20).optional(),
    custom_domain:    f.str().optional().allow("", null),
    is_active:        f.bool.optional(),
  }),

  // TENANTS
  createTenant: Joi.object({
    name:       f.str().required(),
    slug:       f.slug.required(),
    plan:       Joi.string().valid("starter", "pro", "enterprise").default("starter"),
    is_test:    f.bool.default(false),
    test_note:  f.str().optional().allow("", null),
    partner_id: f.uuid_opt,
  }),

  upsertTenantSettings: Joi.object({
    erp_system:      f.str(50).optional().allow("", null),
    erp_db_type:     f.str(20).optional().allow("", null),
    erp_db_host:     f.str().optional().allow("", null),
    erp_db_port:     f.port.optional().allow(null),
    erp_db_name:     f.str(100).optional().allow("", null),
    erp_db_user:     f.str(100).optional().allow("", null),
    erp_db_password: f.str(200).optional().allow("", null),
    smtp_host:       f.str().optional().allow("", null),
    smtp_port:       f.port.optional().allow(null),
    smtp_user:       f.str().optional().allow("", null),
    smtp_password:   f.str(200).optional().allow("", null),
    smtp_from:       f.str().optional().allow("", null),
    x3_soap_url:     f.str(500).optional().allow("", null),
    x3_wsdl_url:     f.str(500).optional().allow("", null),
    x3_username:     f.str().optional().allow("", null),
    x3_password:     f.str(200).optional().allow("", null),
    x3_pool_alias:   f.str(50).optional().allow("", null),
    x3_sales_site:   f.str(20).optional().allow("", null),
    x3_order_type:   f.str(20).optional().allow("", null),
    spaces_folder:   f.str().optional().allow("", null),
    portal_url:      f.str(500).optional().allow("", null),
    admin_email:     f.email.optional().allow("", null),
    // Branding
    logo_url:         f.str(500).optional().allow("", null),
    app_name:         f.str().optional().allow("", null),
    primary_color:    f.str(20).optional().allow("", null),
    default_currency: f.str(10).optional().allow("", null),
    default_language: f.str(10).optional().allow("", null),
    default_unit:     f.str(20).optional().allow("", null),
    custom_domain:    f.str().optional().allow("", null),
  }),

  // USERS
  createUser: Joi.object({
    username:        f.username.required(),
    email:           f.email.required(),
    full_name:       f.str().optional().allow("", null),
    password:        f.password.required(),
    role_name:       f.str(50).optional(),
    default_role:    f.str(50).optional().allow("", null),
    portal_mode:     Joi.string().valid("b2b", "b2c", "both").optional(),
    erp_entity_type: Joi.string().valid("customer", "supplier", "none").optional(),
    erp_entity_code: f.str(50).optional().allow("", null),
    allowedsite:     f.str(500).optional().allow("", null),
    // NOTE: this array was missing from the schema entirely. With
    // stripUnknown:true on the validate() middleware, every erp_mappings
    // payload sent by the multi-portal "Add User Wizard" was being silently
    // deleted before it ever reached the controller — so no additional
    // portal roles and no user_role_erp_mapping rows were ever saved for
    // ANY user created through this endpoint.
    erp_mappings: Joi.array().items(
      Joi.object({
        portal_type:     Joi.string().valid("CUSTOMER", "CONSIGNMENT", "SUPPLIER").required(),
        erp_entity_type: Joi.string().valid("customer", "supplier").optional(),
        erp_entity_code: f.str(50).optional().allow("", null),
        allowedsite:     f.str(500).optional().allow("", null),
        is_default:      f.bool.optional(),
      })
    ).optional(),
  }),

  resetPassword: Joi.object({
    password: f.password.required(),
  }),

  toggleUserStatus: Joi.object({
    is_active: f.bool.required(),
  }),

  // CART
  addToCart: Joi.object({
    product_code:     f.str(50).required(),
    product_name:     f.str(500).optional().allow("", null),
    quantity:         Joi.number().min(0.001).required(),
    price:            Joi.number().min(0).optional(),
    uom:              f.str(20).optional().allow("", null),
    inventory_source: f.str().optional().allow("", null),
  }),

  // MAINTENANCE
  createMaintenance: Joi.object({
    title:      f.str().required(),
    message:    f.str(2000).required(),
    type:       Joi.string().valid("scheduled", "emergency", "info").default("scheduled"),
    start_date: Joi.date().iso().required(),
    end_date:   Joi.date().iso().min(Joi.ref("start_date")).required(),
    is_active:  f.bool.default(true),
    blocks_orders:         f.bool.optional(),
    blocks_cart:           f.bool.optional(),
    blocks_stock_requests: f.bool.optional(),
  }),
};

module.exports = { validate, schemas };
