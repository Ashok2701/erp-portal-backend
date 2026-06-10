const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.getMe);
router.get("/modules", authMiddleware, authController.getModules);

// ── Password Reset ───────────────────────────────────────────────
const pwdReset = require("../services/passwordReset.service");

router.post("/forgot-password", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ success: false, message: "identifier is required" });
    await pwdReset.requestReset(identifier, null);
    // Always 200 — anti-enumeration
    res.json({ success: true, message: "If an account exists with that email/username, a reset link has been sent." });
  } catch (err) {
    console.error("forgot-password:", err.message);
    res.json({ success: true }); // still 200
  }
});

router.get("/verify-reset-token", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, reason: "missing" });
    const result = await pwdReset.verifyToken(token);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: true, data: { valid: false, reason: "error" } });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password)
      return res.status(400).json({ success: false, message: "token and new_password are required" });
    await pwdReset.resetPassword(token, new_password);
    res.json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;