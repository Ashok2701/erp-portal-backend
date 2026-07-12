const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/erp.controller");
const auth = require("../middleware/auth.middleware");

router.get("/customers", auth, ctrl.getCustomers);
router.get("/suppliers", auth, ctrl.getSuppliers);
//router.get("/products", auth, ctrl.getProducts);
router.get("/dashboard", auth, ctrl.getDashboard);
router.get("/products", auth, ctrl.getProducts);
router.get("/product-categories", auth, ctrl.getProductCategories);

 router.get("/customers/:customerCode/addresses", auth, ctrl.getCustomerAddresses);
router.get("/customers/:customerCode/detail",    auth, ctrl.getCustomerDetail);
router.get("/config-status",                     auth, ctrl.getConfigStatus);
 router.get("/suppliers/:supplierCode/addresses", auth, ctrl.getSupplierAddresses);

 router.get("/stock", auth, ctrl.getStock);
 router.get("/sites", auth, ctrl.getAllSites);
// Consignment loop
router.post("/consignment/consume",   auth, ctrl.recordConsumption);
router.post("/consignment/replenish", auth, ctrl.requestReplenishment);
router.get ("/consignment/dashboard", auth, ctrl.getConsignmentDashboard);

// Account statement
router.get ("/statement", auth, ctrl.getStatement);

module.exports = router;