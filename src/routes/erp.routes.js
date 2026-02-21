const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/erp.controller");
const auth = require("../middleware/auth.middleware");

router.get("/customers", auth, ctrl.getCustomers);
router.get("/suppliers", auth, ctrl.getSuppliers);
router.get("/products", auth, ctrl.getProducts);
router.get("/customers/:code/addresses", auth, ctrl.getCustomerAddresses);
router.get("/dashboard", auth, ctrl.getDashboard);

module.exports = router;