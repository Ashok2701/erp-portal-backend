const cartService = require("../services/cart.service");

exports.addToCart = async (req, res) => {
  try {
    const data = await cartService.addToCart(req);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCart = async (req, res) => {
  const data = await cartService.getCart(req);
  res.json({ success: true, data });
};

exports.updateItem = async (req, res) => {
  const data = await cartService.updateItem(req.params.id, req.body);
  res.json({ success: true, data });
};

exports.deleteItem = async (req, res) => {
  await cartService.deleteItem(req.params.id);
  res.json({ success: true });
};

exports.clearCart = async (req, res) => {
  await cartService.clearCart(req);
  res.json({ success: true });
};

exports.checkout = async (req, res) => {
  try {
    res.json(await cartService.checkout(req));  // ✅ 'cartService'
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};