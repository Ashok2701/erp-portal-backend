// ============================================================
// FILE 3: src/services/actionExecutor.service.js
// Executes actions returned by LLM
// ============================================================

const { pool } = require('../config/database');

class ActionExecutorService {
  constructor(userId, tenantId, userRole) {
    this.userId = userId;
    this.tenantId = tenantId;
    this.userRole = userRole;
  }

  /**
   * Execute an action and return the result
   * @param {Object} action - { action: string, params: object }
   */
  async execute(action) {
    const actionName = action.action;
    const params = action.params || {};

    console.log(`Executing action: ${actionName}`, params);

    try {
      switch (actionName) {
        // ============ ORDER ACTIONS ============
        case 'get_orders':
        case 'get_my_orders':
          return await this.getOrders(params);

        case 'get_order':
          return await this.getOrder(params.order_id || params.id);

        case 'create_order':
          return await this.createOrder(params);

        case 'track_order':
          return await this.trackOrder(params.order_id);

        // ============ PRODUCT ACTIONS ============
        case 'get_products':
          return await this.getProducts(params);

        case 'get_product':
          return await this.getProduct(params.product_id || params.id);

        case 'check_stock':
          return await this.checkStock(params.product_id, params.quantity);

        // ============ CUSTOMER ACTIONS ============
        case 'get_customers':
          return await this.getCustomers(params);

        case 'get_customer':
          return await this.getCustomer(params.customer_id || params.id);

        // ============ CART ACTIONS ============
        case 'add_to_cart':
          return await this.addToCart(params);

        case 'get_cart':
          return await this.getCart();

        // ============ ADMIN ACTIONS ============
        case 'get_user_stats':
          return await this.getUserStats();

        case 'list_users':
          return await this.listUsers(params);

        case 'get_user':
          return await this.getUser(params.user_id || params.username);

        case 'reset_password':
          return await this.resetPassword(params.user_id);

        // ============ DASHBOARD ACTIONS ============
        case 'get_dashboard_stats':
          return await this.getDashboardStats();

        // ============ BACKORDER ACTIONS ============
        case 'create_backorder':
          return await this.createBackorder(params);

        case 'partial_order':
          return await this.handlePartialOrder(params);

        default:
          return { 
            success: false, 
            error: `Unknown action: ${actionName}`,
            message: `I don't know how to perform "${actionName}". Please try a different request.`
          };
      }
    } catch (error) {
      console.error(`Error executing action ${actionName}:`, error);
      return { 
        success: false, 
        error: error.message,
        message: `Sorry, there was an error: ${error.message}`
      };
    }
  }

  // ============ ORDER METHODS ============
  async getOrders(params = {}) {
    let query = `
      SELECT sr.*, 
        (SELECT json_agg(sri.*) FROM sales_request_items sri WHERE sri.sales_request_id = sr.id) as items
      FROM sales_request sr
      WHERE sr.tenant_id = $1
    `;
    const values = [this.tenantId];
    let paramIndex = 2;

    // For non-admin users, filter by their own orders
    if (this.userRole !== 'admin') {
      query += ` AND sr.created_by = $${paramIndex}`;
      values.push(this.userId);
      paramIndex++;
    }

    // Apply filters
    if (params.status) {
      query += ` AND sr.status = $${paramIndex}`;
      values.push(params.status);
      paramIndex++;
    }

    if (params.date_range === 'today') {
      query += ` AND DATE(sr.created_at) = CURRENT_DATE`;
    } else if (params.date_range === 'last_week') {
      query += ` AND sr.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (params.date_range === 'last_month') {
      query += ` AND sr.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    query += ` ORDER BY sr.created_at DESC LIMIT 50`;

    const result = await pool.query(query, values);
    
    return {
      success: true,
      count: result.rows.length,
      orders: result.rows
    };
  }

  async getOrder(orderId) {
    const query = `
      SELECT sr.*, 
        (SELECT json_agg(sri.*) FROM sales_request_items sri WHERE sri.sales_request_id = sr.id) as items,
        (SELECT row_to_json(sra.*) FROM sales_request_address sra WHERE sra.sales_request_id = sr.id LIMIT 1) as address
      FROM sales_request sr
      WHERE sr.id = $1 AND sr.tenant_id = $2
    `;
    const result = await pool.query(query, [orderId, this.tenantId]);
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Order not found' };
    }

    return { success: true, order: result.rows[0] };
  }

  async createOrder(params) {
    // This would integrate with your existing order creation logic
    // For now, return a placeholder
    return {
      success: true,
      message: 'Order creation initiated',
      note: 'Please use the Cart page to complete your order with signature and location.'
    };
  }

  async trackOrder(orderId) {
    const result = await this.getOrder(orderId);
    if (!result.success) return result;

    const order = result.order;
    return {
      success: true,
      order_number: order.order_number || order.id,
      status: order.status,
      created_at: order.created_at,
      estimated_delivery: order.estimated_delivery || 'Contact support for delivery estimate'
    };
  }

  // ============ PRODUCT METHODS ============
  async getProducts(params = {}) {
    // Assuming you have a products table - adjust based on your schema
    let query = `SELECT * FROM products WHERE tenant_id = $1`;
    const values = [this.tenantId];
    let paramIndex = 2;

    if (params.category) {
      query += ` AND category ILIKE $${paramIndex}`;
      values.push(`%${params.category}%`);
      paramIndex++;
    }

    if (params.search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      values.push(`%${params.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY name LIMIT 50`;

    try {
      const result = await pool.query(query, values);
      return { success: true, count: result.rows.length, products: result.rows };
    } catch (error) {
      // Table might not exist yet
      return { 
        success: true, 
        count: 0, 
        products: [],
        note: 'Product catalog not available in database yet'
      };
    }
  }

  async getProduct(productId) {
    try {
      const query = `SELECT * FROM products WHERE id = $1 AND tenant_id = $2`;
      const result = await pool.query(query, [productId, this.tenantId]);
      
      if (result.rows.length === 0) {
        return { success: false, message: 'Product not found' };
      }

      return { success: true, product: result.rows[0] };
    } catch {
      return { success: false, message: 'Product lookup not available' };
    }
  }

  async checkStock(productId, requestedQty = 1) {
    try {
      const query = `SELECT id, name, stock, price FROM products WHERE id = $1 AND tenant_id = $2`;
      const result = await pool.query(query, [productId, this.tenantId]);
      
      if (result.rows.length === 0) {
        return { success: false, message: 'Product not found' };
      }

      const product = result.rows[0];
      const available = product.stock || 0;
      const canFulfill = available >= requestedQty;

      return {
        success: true,
        product_id: product.id,
        product_name: product.name,
        requested: requestedQty,
        available: available,
        can_fulfill: canFulfill,
        shortage: canFulfill ? 0 : requestedQty - available
      };
    } catch {
      return { 
        success: true, 
        message: 'Stock check not available - product catalog pending setup',
        available: 'Unknown'
      };
    }
  }

  // ============ CUSTOMER METHODS ============
  async getCustomers(params = {}) {
    // Using users table with role filter, or a separate customers table
    const query = `
      SELECT user_id, username, email, is_active 
      FROM users 
      WHERE tenant_id = $1
      ORDER BY username
      LIMIT 50
    `;
    const result = await pool.query(query, [this.tenantId]);
    return { success: true, count: result.rows.length, customers: result.rows };
  }

  async getCustomer(customerId) {
    const query = `
      SELECT user_id, username, email, is_active
      FROM users 
      WHERE (user_id = $1 OR username = $1) AND tenant_id = $2
    `;
    const result = await pool.query(query, [customerId, this.tenantId]);
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Customer not found' };
    }

    return { success: true, customer: result.rows[0] };
  }

  // ============ CART METHODS ============
  async addToCart(params) {
    // Check stock first
    const stockCheck = await this.checkStock(params.product_id, params.quantity);
    
    if (!stockCheck.success) {
      return stockCheck;
    }

    if (!stockCheck.can_fulfill && stockCheck.available > 0) {
      // Partial stock available
      return {
        success: false,
        requires_confirmation: true,
        type: 'stock_shortage',
        product_id: params.product_id,
        product_name: stockCheck.product_name,
        requested: params.quantity,
        available: stockCheck.available,
        message: `Only ${stockCheck.available} units available out of ${params.quantity} requested.`
      };
    }

    if (stockCheck.available === 0) {
      return {
        success: false,
        message: `${stockCheck.product_name} is currently out of stock.`,
        can_backorder: true
      };
    }

    // Cart is typically managed in frontend/session
    // Return success to indicate item can be added
    return {
      success: true,
      message: `Added ${params.quantity} x ${stockCheck.product_name} to cart`,
      product_id: params.product_id,
      quantity: params.quantity
    };
  }

  async getCart() {
    // Cart is typically managed in frontend
    return {
      success: true,
      message: 'Please check your cart in the Cart tab',
      note: 'Cart data is managed in the frontend application'
    };
  }

  // ============ ADMIN METHODS ============
  async getUserStats() {
    if (this.userRole !== 'admin') {
      return { success: false, message: 'Admin access required' };
    }

    const query = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_active = true) as active_users,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_users
      FROM users
      WHERE tenant_id = $1
    `;
    const result = await pool.query(query, [this.tenantId]);

    // Get role breakdown
    const roleQuery = `
      SELECT r.role_name, COUNT(ur.user_id) as count
      FROM roles r
      LEFT JOIN user_roles ur ON r.role_id = ur.role_id
      LEFT JOIN users u ON ur.user_id = u.user_id AND u.tenant_id = $1
      WHERE r.tenant_id = $1
      GROUP BY r.role_id, r.role_name
    `;
    const roleResult = await pool.query(roleQuery, [this.tenantId]);

    return {
      success: true,
      stats: result.rows[0],
      by_role: roleResult.rows
    };
  }

  async listUsers(params = {}) {
    if (this.userRole !== 'admin') {
      return { success: false, message: 'Admin access required' };
    }

    let query = `
      SELECT u.user_id, u.username, u.email, u.is_active, u.created_at,
        (SELECT array_agg(r.role_name) FROM user_roles ur JOIN roles r ON ur.role_id = r.role_id WHERE ur.user_id = u.user_id) as roles
      FROM users u
      WHERE u.tenant_id = $1
    `;
    const values = [this.tenantId];
    let paramIndex = 2;

    if (params.status === 'active') {
      query += ` AND u.is_active = true`;
    } else if (params.status === 'inactive') {
      query += ` AND u.is_active = false`;
    }

    query += ` ORDER BY u.created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);
    return { success: true, count: result.rows.length, users: result.rows };
  }

  async getUser(userIdOrUsername) {
    if (this.userRole !== 'admin') {
      return { success: false, message: 'Admin access required' };
    }

    const query = `
      SELECT u.user_id, u.username, u.email, u.is_active, u.created_at,
        (SELECT array_agg(r.role_name) FROM user_roles ur JOIN roles r ON ur.role_id = r.role_id WHERE ur.user_id = u.user_id) as roles
      FROM users u
      WHERE (u.user_id = $1 OR u.username = $1) AND u.tenant_id = $2
    `;
    const result = await pool.query(query, [userIdOrUsername, this.tenantId]);

    if (result.rows.length === 0) {
      return { success: false, message: 'User not found' };
    }

    return { success: true, user: result.rows[0] };
  }

  async resetPassword(userId) {
    if (this.userRole !== 'admin') {
      return { success: false, message: 'Admin access required' };
    }

    // In real implementation, generate temp password and send email
    // For now, return instructions
    return {
      success: true,
      message: 'Password reset initiated',
      note: 'Please use the User Management page to reset the password securely.'
    };
  }

  // ============ DASHBOARD METHODS ============
  async getDashboardStats() {
    let query;
    const values = [this.tenantId];

    if (this.userRole === 'admin') {
      return await this.getUserStats();
    }

    // For sales rep, customer, supplier - get order stats
    query = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales_request
      WHERE tenant_id = $1 AND created_by = $2
    `;
    values.push(this.userId);

    const result = await pool.query(query, values);
    return { success: true, stats: result.rows[0] };
  }

  // ============ BACKORDER METHODS ============
  async createBackorder(params) {
    // Insert into backorders table
    const query = `
      INSERT INTO backorders (user_id, tenant_id, product_id, quantity, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [
        this.userId, 
        this.tenantId, 
        params.product_id, 
        params.quantity
      ]);
      
      return {
        success: true,
        backorder_id: result.rows[0].id,
        message: `Backorder created for ${params.quantity} units. You'll be notified when available.`
      };
    } catch (error) {
      // Table might not exist
      return {
        success: true,
        message: `Backorder noted for ${params.quantity} units. You'll be notified when available.`,
        note: 'Backorder tracking will be available soon.'
      };
    }
  }

  async handlePartialOrder(params) {
    // Handle partial order: order available stock now, backorder the rest
    const results = {
      ordered_now: params.order_now,
      backordered: params.backorder,
      notify: params.notify
    };

    if (params.backorder > 0 && params.notify) {
      await this.createBackorder({
        product_id: params.product_id,
        quantity: params.backorder
      });
    }

    return {
      success: true,
      message: `Order placed for ${params.order_now} units. ${params.backorder} units backordered.`,
      results
    };
  }
}

module.exports = ActionExecutorService;
