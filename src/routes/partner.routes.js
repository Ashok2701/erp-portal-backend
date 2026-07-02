"use strict";
const express  = require("express");
const router   = express.Router();
const ctrl     = require("../controllers/partner.controller");
const auth     = require("../middleware/auth.middleware");
const { ownerOnly, partnerOnly, injectPartnerScope } = require("../middleware/partner.middleware");

// ── PUBLIC ───────────────────────────────────────────────────
router.get("/config/branding", ctrl.getBrandingConfig);

// ── OWNER DASHBOARD STATS ────────────────────────────────────
router.get("/dashboard/stats", auth, ownerOnly, ctrl.getOwnerDashboardStats);

// ── OWNER MANAGEMENT (before /:id to avoid conflict) ─────────
router.get  ("/owners",         auth, ownerOnly, ctrl.listOwners);
router.post ("/owners",         auth, ownerOnly, ctrl.createOwner);
router.put  ("/owners/:userId", auth, ownerOnly, ctrl.toggleOwnerStatus);

// ── OWNER ONLY — full partner management ─────────────────────
router.get  ("/",    auth, ownerOnly, ctrl.listPartners);
router.post ("/",    auth, ownerOnly, ctrl.createPartner);

// ── PARTNER PROFILE — owner or the partner themselves ─────────
router.get  ("/:id/profile", auth, partnerOnly, injectPartnerScope, ctrl.getPartnerProfile);
router.put  ("/:id/profile", auth, partnerOnly, injectPartnerScope, ctrl.updatePartnerProfile);

// ── OWNER ONLY — view/edit any partner ───────────────────────
router.get  ("/:id",         auth, ownerOnly, ctrl.getPartner);
router.put  ("/:id",         auth, ownerOnly, ctrl.updatePartner);

// ── PARTNER USERS — owner creates, both can view/toggle ──────
router.get  ("/:id/users",          auth, partnerOnly, injectPartnerScope, ctrl.getPartnerUsers);
router.post ("/:id/users",          auth, ownerOnly,   ctrl.createPartnerUser);
router.put  ("/:id/users/:userId",  auth, ownerOnly,   ctrl.togglePartnerUserStatus);

// ── TENANT MANAGEMENT ─────────────────────────────────────────
router.get  ("/:id/tenants",                        auth, partnerOnly, injectPartnerScope, ctrl.getPartnerTenants);
router.post ("/:id/tenants",                        auth, partnerOnly, injectPartnerScope, ctrl.createTenantUnderPartner);
router.post ("/:id/tenants/:tenantId/admin-user",   auth, partnerOnly, injectPartnerScope, ctrl.createTenantAdminUser);

module.exports = router;
