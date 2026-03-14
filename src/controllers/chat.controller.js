// ============================================================
// FILE 4: src/controllers/chat.controller.js
// Chat API Controller
// ============================================================

const ChatModel = require('../models/chat.model');
const LLMService = require('../services/llm.service');
const ActionExecutorService = require('../services/actionExecutor.service');

class ChatController {
  /**
   * POST /api/chat/message
   * Send a message and get AI response
   */
  static async sendMessage(req, res) {
    try {
      const { message, conversation_id } = req.body;
      const userId = req.user.user_id;
      const tenantId = req.user.tenant_id;
      const userRole = req.user.role || 'customer';

      if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get or create conversation
      let conversationId = conversation_id;
      if (!conversationId) {
        const newConv = await ChatModel.createConversation(
          userId, 
          tenantId, 
          message.substring(0, 50) + (message.length > 50 ? '...' : '')
        );
        conversationId = newConv.id;
      }

      // Save user message
      await ChatModel.addMessage(conversationId, 'user', message);

      // Get conversation history for context
      const history = await ChatModel.getRecentMessages(conversationId, 10);

      // Process with LLM
      const llmResult = await LLMService.processMessage(message, userRole, history);

      let finalResponse;
      let actionTaken = null;
      let actionResult = null;

      if (llmResult.action) {
        // Execute the action
        const executor = new ActionExecutorService(userId, tenantId, userRole);
        actionResult = await executor.execute(llmResult.action);
        actionTaken = llmResult.action;

        // Check if it requires user confirmation (e.g., stock shortage)
        if (actionResult.requires_confirmation) {
          // Generate response asking for confirmation
          finalResponse = await LLMService.handleStockShortage(
            { name: actionResult.product_name },
            actionResult.requested,
            actionResult.available,
            userRole
          );
        } else {
          // Generate natural response from result
          finalResponse = await LLMService.generateResponseFromResult(
            llmResult.action, 
            actionResult, 
            userRole
          );
        }
      } else {
        // Regular chat response (no action needed)
        finalResponse = llmResult.response;
      }

      // Save assistant message
      await ChatModel.addMessage(
        conversationId, 
        'assistant', 
        finalResponse,
        actionTaken?.action,
        actionTaken?.params,
        actionResult
      );

      // Update conversation title if it's the first real message
      if (!conversation_id) {
        await ChatModel.updateConversationTitle(
          conversationId, 
          message.substring(0, 50) + (message.length > 50 ? '...' : '')
        );
      }

      res.json({
        success: true,
        conversation_id: conversationId,
        response: finalResponse,
        action_taken: actionTaken,
        action_result: actionResult,
        requires_confirmation: actionResult?.requires_confirmation || false
      });

    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ 
        error: 'Failed to process message',
        details: error.message 
      });
    }
  }

  /**
   * GET /api/chat/conversations
   * Get user's conversation list
   */
  static async getConversations(req, res) {
    try {
      const userId = req.user.user_id;
      const tenantId = req.user.tenant_id;
      const limit = parseInt(req.query.limit) || 20;

      const conversations = await ChatModel.getConversations(userId, tenantId, limit);

      res.json({
        success: true,
        conversations
      });
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({ error: 'Failed to get conversations' });
    }
  }

  /**
   * GET /api/chat/conversations/:id
   * Get a conversation with all messages
   */
  static async getConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const userId = req.user.user_id;

      const conversation = await ChatModel.getConversationWithMessages(conversationId, userId);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json({
        success: true,
        conversation
      });
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({ error: 'Failed to get conversation' });
    }
  }

  /**
   * DELETE /api/chat/conversations/:id
   * Delete a conversation
   */
  static async deleteConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const userId = req.user.user_id;

      const deleted = await ChatModel.deleteConversation(conversationId, userId);

      if (!deleted) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      res.json({
        success: true,
        message: 'Conversation deleted'
      });
    } catch (error) {
      console.error('Delete conversation error:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  }

  /**
   * POST /api/chat/confirm-action
   * Confirm a pending action (e.g., partial order)
   */
  static async confirmAction(req, res) {
    try {
      const { conversation_id, action, confirmed, params } = req.body;
      const userId = req.user.user_id;
      const tenantId = req.user.tenant_id;
      const userRole = req.user.role || 'customer';

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      const executor = new ActionExecutorService(userId, tenantId, userRole);
      
      let result;
      let response;

      if (confirmed) {
        // Execute the confirmed action
        result = await executor.execute({ action, params });
        response = await LLMService.generateResponseFromResult({ action, params }, result, userRole);
      } else {
        result = { success: true, cancelled: true };
        response = "No problem! I've cancelled that request. Is there anything else I can help you with?";
      }

      // Save the interaction
      if (conversation_id) {
        await ChatModel.addMessage(
          conversation_id,
          'user',
          confirmed ? 'Yes, proceed with that' : 'No, cancel that'
        );
        await ChatModel.addMessage(
          conversation_id,
          'assistant',
          response,
          action,
          params,
          result
        );
      }

      res.json({
        success: true,
        response,
        action_result: result
      });

    } catch (error) {
      console.error('Confirm action error:', error);
      res.status(500).json({ error: 'Failed to confirm action' });
    }
  }
}

module.exports = ChatController;
