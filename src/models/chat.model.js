// ============================================================
// LLM CHAT SERVICE FOR ERP PORTAL
// Add these files to your Node.js backend
// ============================================================

// ============================================================
// FILE 1: src/models/chat.model.js
// ============================================================

const { pool } = require('../config/database');

class ChatModel {
  // Create a new conversation
  static async createConversation(userId, tenantId, title = 'New conversation') {
    const query = `
      INSERT INTO chat_conversations (user_id, tenant_id, title, created_at, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    const result = await pool.query(query, [userId, tenantId, title]);
    return result.rows[0];
  }

  // Get conversations for a user
  static async getConversations(userId, tenantId, limit = 20) {
    const query = `
      SELECT 
        c.*,
        (SELECT content FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_conversations c
      WHERE c.user_id = $1 AND c.tenant_id = $2
      ORDER BY c.updated_at DESC
      LIMIT $3
    `;
    const result = await pool.query(query, [userId, tenantId, limit]);
    return result.rows;
  }

  // Get a single conversation with messages
  static async getConversationWithMessages(conversationId, userId) {
    const convQuery = `
      SELECT * FROM chat_conversations 
      WHERE id = $1 AND user_id = $2
    `;
    const convResult = await pool.query(convQuery, [conversationId, userId]);
    
    if (convResult.rows.length === 0) {
      return null;
    }

    const msgQuery = `
      SELECT * FROM chat_messages 
      WHERE conversation_id = $1 
      ORDER BY created_at ASC
    `;
    const msgResult = await pool.query(msgQuery, [conversationId]);

    return {
      ...convResult.rows[0],
      messages: msgResult.rows
    };
  }

  // Add a message to conversation
  static async addMessage(conversationId, role, content, actionType = null, actionParams = null, actionResult = null) {
    const query = `
      INSERT INTO chat_messages (conversation_id, role, content, action_type, action_params, action_result, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    const result = await pool.query(query, [
      conversationId, 
      role, 
      content, 
      actionType, 
      actionParams ? JSON.stringify(actionParams) : null,
      actionResult ? JSON.stringify(actionResult) : null
    ]);

    // Update conversation timestamp
    await pool.query(
      'UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );

    return result.rows[0];
  }

  // Update conversation title
  static async updateConversationTitle(conversationId, title) {
    const query = `
      UPDATE chat_conversations 
      SET title = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await pool.query(query, [title, conversationId]);
    return result.rows[0];
  }

  // Delete conversation
  static async deleteConversation(conversationId, userId) {
    const query = `
      DELETE FROM chat_conversations 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [conversationId, userId]);
    return result.rows[0];
  }

  // Get recent messages for context (for LLM)
  static async getRecentMessages(conversationId, limit = 10) {
    const query = `
      SELECT role, content FROM chat_messages 
      WHERE conversation_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    const result = await pool.query(query, [conversationId, limit]);
    return result.rows.reverse(); // Return in chronological order
  }
}

module.exports = ChatModel;
