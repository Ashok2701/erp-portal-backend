"use strict";
const express  = require("express");
const router   = express.Router();
const ctrl     = require("../controllers/partner.controller");
const auth     = require("../middleware/auth.middleware");
const { ownerOnly, partnerOnly, injectPartnerScope } = require("../middleware/partner.middleware");

// ── PUBLIC ───────────────────────────────────────────────────
// Branding config — called by frontend on load (no auth needed)
router.get("/config/branding", ctrl.getBrandingConfig);

// ── OWNER ONLY — full partner management ─────────────────────
router.get   ("/",              auth, ownerOnly, ctrl.listPartners);
router.post  ("/",              auth, ownerOnly, ctrl.createPartner);
router.get   ("/:id",           auth, ownerOnly, ctrl.getPartner);
router.put   ("/:id",           auth, ownerOnly, ctrl.updatePartner);
router.get   ("/:id/users",     auth, ownerOnly, ctrl.getPartnerUsers);
router.post  ("/:id/users",     auth, ownerOnly, ctrl.addPartnerUser);

// ── PARTNER + OWNER — tenant management under a partner ──────
router.get   ("/:id/tenants",   auth, partnerOnly, injectPartnerScope, ctrl.getPartnerTenants);
router.post  ("/:id/tenants",   auth, partnerOnly, injectPartnerScope, ctrl.createTenantUnderPartner);

// ── OWNER MANAGEMENT ─────────────────────────────────────────
router.get  ('/owners',           auth, ownerOnly, ctrl.listOwners);
router.post ('/owners',           auth, ownerOnly, ctrl.createOwner);
router.put  ('/owners/:userId',   auth, ownerOnly, ctrl.toggleOwnerStatus);

module.exports = router;
