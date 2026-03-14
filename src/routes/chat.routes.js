// ============================================================
// FILE 5: src/routes/chat.routes.js
// Chat API Routes
// ============================================================

const express = require("express");
const router = express.Router();
const ChatController = require("../controllers/chat.controller");
//const { authenticateToken } = require('../middleware/auth.middleware');
const authMiddleware = require("../middleware/auth.middleware");

// All chat routes require authentication
//router.use(authenticateToken);

// Send a message and get AI response
router.post("/message",authMiddleware, ChatController.sendMessage);

// Get user's conversations
router.get("/conversations",authMiddleware, ChatController.getConversations);

// Get a specific conversation with messages
router.get("/conversations/:id",authMiddleware, ChatController.getConversation);

// Delete a conversation
router.delete("/conversations/:id",authMiddleware, ChatController.deleteConversation);

// Confirm a pending action (for stock shortage, etc.)
router.post("/confirm-action",authMiddleware, ChatController.confirmAction);

module.exports = router;
