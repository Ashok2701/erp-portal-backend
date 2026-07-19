"use strict";
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/supplier.controller");
const auth    = require("../middleware/auth.middleware");
const { createUpload } = require("../middleware/uploadSpaces");

// Invoice upload middleware
const uploadInvoice = createUpload("supplier-invoices", { pdfOnly: true, maxSize: 20 * 1024 * 1024 });

// Purchase Orders
router.get  ("/purchase-orders",              auth, ctrl.listPurchaseOrders);
router.get  ("/purchase-orders/:poNumber",    auth, ctrl.getPurchaseOrderDetail);
router.post ("/purchase-orders/:poNumber/accept",  auth, ctrl.acceptPurchaseOrder);
router.post ("/purchase-orders/:poNumber/reject",  auth, ctrl.rejectPurchaseOrder);
router.post ("/purchase-orders/:poNumber/asn",     auth, ctrl.submitASN);
router.post ("/purchase-orders/:poNumber/invoice", auth, uploadInvoice.single("invoice"), ctrl.uploadInvoice);

// Supplier consignment & dashboard
router.get  ("/consignment",  auth, ctrl.getSupplierConsignment);
router.get  ("/dashboard",    auth, ctrl.getSupplierDashboard);


module.exports = router;
