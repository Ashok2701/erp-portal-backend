const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");
const auth = require("../middleware/auth.middleware");





router.post("/items", auth, cartController.addToCart);
router.get("/", auth, cartController.getCart);
router.put("/items/:id", auth, cartController.updateItem);
router.delete("/items/:id", auth, cartController.deleteItem);
router.delete("/", auth, cartController.clearCart);

module.exports = router;