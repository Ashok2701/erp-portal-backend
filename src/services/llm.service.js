// ============================================================
// FILE 2: src/services/llm.service.js
// OpenAI GPT-4o-mini Integration
// ============================================================

const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// System prompts based on user role
const SYSTEM_PROMPTS = {
  admin: `You are an Admin Assistant for a B2B ERP Portal. You help administrators manage users, view system statistics, and handle administrative tasks.

Available actions you can request:
- get_user_stats: Get statistics about users (total, active by role)
- list_users: List users with optional filters (role, status)
- get_user: Get details of a specific user by ID or username
- create_user: Create a new user (you'll need: username, name, email, phone, role)
- update_user: Update user details
- reset_password: Reset a user's password
- deactivate_user: Deactivate a user account

When user asks something, analyze their intent and respond with a JSON action OR a helpful message.
If an action is needed, respond ONLY with JSON in this format:
{"action": "action_name", "params": {...}}

If no action needed (just chatting), respond normally as a helpful assistant.`,

  sales_rep: `You are a Sales Assistant for a B2B ordering platform. You help sales representatives manage orders, customers, and products.

Available actions you can request:
- get_orders: Get orders (filters: status, date_range, customer_id)
- get_order: Get specific order details by order_id
- get_customers: Get customer list
- get_customer: Get specific customer details
- get_products: Get product list (filters: category, search)
- get_product: Get specific product details
- check_stock: Check stock for a product
- create_order: Create a new order
- get_dashboard_stats: Get sales dashboard statistics

When user asks something, analyze their intent and respond with a JSON action OR a helpful message.
If an action is needed, respond ONLY with JSON in this format:
{"action": "action_name", "params": {...}}

If no action needed (just chatting), respond normally as a helpful assistant.`,

  customer: `You are an Order Assistant for a B2B ordering platform. You help customers track orders, browse products, and place orders.

Available actions you can request:
- get_my_orders: Get customer's own orders (filters: status, date_range)
- get_order: Get specific order details
- get_products: Get product list (filters: category, search)
- get_product: Get specific product details  
- check_stock: Check stock availability for a product
- add_to_cart: Add product to cart (needs: product_id, quantity)
- get_cart: Get current cart items
- create_order: Place an order from cart
- track_order: Track order delivery status

When user asks something, analyze their intent and respond with a JSON action OR a helpful message.
If an action is needed, respond ONLY with JSON in this format:
{"action": "action_name", "params": {...}}

IMPORTANT: For stock issues, always inform the user and ask for confirmation before proceeding.
Example: "We only have X in stock. Would you like to order X now and be notified when more arrive?"

If no action needed (just chatting), respond normally as a helpful assistant.`,

  supplier: `You are a Supplier Assistant for a B2B ordering platform. You help suppliers manage inventory, track orders, and handle fulfillment.

Available actions you can request:
- get_my_orders: Get supplier's own orders
- get_order: Get specific order details
- get_products: Get product list
- get_product: Get specific product details
- check_stock: Check stock availability
- update_stock: Update stock quantity for a product
- get_inventory: Get full inventory report
- add_to_cart: Add product to cart
- create_order: Place an order
- get_pending_fulfillments: Get orders pending fulfillment

When user asks something, analyze their intent and respond with a JSON action OR a helpful message.
If an action is needed, respond ONLY with JSON in this format:
{"action": "action_name", "params": {...}}

If no action needed (just chatting), respond normally as a helpful assistant.`
};

class LLMService {
  /**
   * Process user message and get LLM response
   * @param {string} userMessage - The user's message
   * @param {string} userRole - User's role (admin, sales_rep, customer, supplier)
   * @param {Array} conversationHistory - Previous messages for context
   * @returns {Object} - { response: string, action: object|null }
   */
  static async processMessage(userMessage, userRole, conversationHistory = []) {
    try {
      const systemPrompt = SYSTEM_PROMPTS[userRole] || SYSTEM_PROMPTS.customer;

      // Build messages array with conversation history
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage }
      ];

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      });

      const assistantMessage = completion.choices[0].message.content;

      // Try to parse as JSON action
      const actionResult = this.parseAction(assistantMessage);

      return {
        response: actionResult.isAction ? null : assistantMessage,
        action: actionResult.isAction ? actionResult.action : null,
        rawResponse: assistantMessage
      };
    } catch (error) {
      console.error('LLM Service Error:', error);
      throw new Error('Failed to process message with AI');
    }
  }

  /**
   * Parse LLM response to check if it's an action request
   */
  static parseAction(response) {
    try {
      // Check if response is JSON
      const trimmed = response.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.action) {
          return { isAction: true, action: parsed };
        }
      }
      return { isAction: false, action: null };
    } catch {
      return { isAction: false, action: null };
    }
  }

  /**
   * Generate a natural language response from action result
   */
  static async generateResponseFromResult(action, result, userRole) {
    try {
      const prompt = `Based on this action and result, generate a helpful, natural response for the user.
      
Action performed: ${action.action}
Parameters: ${JSON.stringify(action.params || {})}
Result: ${JSON.stringify(result)}

Generate a clear, friendly response summarizing the result. Be concise but informative.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are a helpful assistant. Generate natural language responses based on action results. Be concise and friendly.` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Error generating response:', error);
      return `Action completed: ${action.action}`;
    }
  }

  /**
   * Handle stock shortage conversation
   */
  static async handleStockShortage(product, requestedQty, availableQty, userRole) {
    const prompt = `A user wants to order ${requestedQty} units of "${product.name}" but only ${availableQty} are available in stock.

Generate a helpful response that:
1. Informs them of the shortage
2. Offers options:
   - Order ${availableQty} now and get notified when more are available
   - Wait until all ${requestedQty} are available
   - Cancel this request
3. Be friendly and helpful`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful ordering assistant. Be concise and offer clear options.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return completion.choices[0].message.content;
  }
}

module.exports = LLMService;
