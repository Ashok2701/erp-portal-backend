const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/erp.controller");
const auth = require("../middleware/auth.middleware");

router.get("/customers", auth, ctrl.getCustomers);
router.get("/suppliers", auth, ctrl.getSuppliers);
router.get("/products", auth, ctrl.getProducts);
router.get("/dashboard", auth, ctrl.getDashboard);

router.get("/products", auth, ctrl.getProducts);
router.get("/product-categories", auth, ctrl.getProductCategories);

// router.get("/customers/:customerCode/addresses", auth, ctrl.getCustomerAddresses);
// router.get("/suppliers/:supplierCode/addresses", auth, ctrl.getSupplierAddresses);

module.exports = router;