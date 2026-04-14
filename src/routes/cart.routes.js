const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");
const auth = require("../middleware/auth.middleware");



router.post('/add', cartController.addToCart);
router.get('/', cartController.getCart);
router.put('/item/:id', cartController.updateItem);
router.delete('/item/:id', cartController.deleteItem);
router.delete('/clear', cartController.clearCart);
router.post('/checkout', cartController.checkout);

module.exports = router;