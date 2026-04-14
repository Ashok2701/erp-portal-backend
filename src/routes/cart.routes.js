const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");
const auth = require("../middleware/auth.middleware");



router.post('/add', auth, cartController.addToCart);
router.get('/', auth, cartController.getCart);
router.put('/item/:id', auth, cartController.updateItem);
router.delete('/item/:id', auth, cartController.deleteItem);
router.delete('/clear', auth, cartController.clearCart);
router.post('/checkout', auth, cartController.checkout);

module.exports = router;