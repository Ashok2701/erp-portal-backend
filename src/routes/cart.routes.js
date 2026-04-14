const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");
const auth = require("../middleware/auth.middleware");



router.post('/add', controller.addToCart);
router.get('/', controller.getCart);
router.put('/item/:id', controller.updateItem);
router.delete('/item/:id', controller.deleteItem);
router.delete('/clear', controller.clearCart);
router.post('/checkout', controller.checkout);

module.exports = router;