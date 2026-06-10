class BaseERPAdapter {
  async getCustomers() {
    throw new Error("getCustomers not implemented");
  }

  async getSuppliers() {
    throw new Error("getSuppliers not implemented");
  }

  async getProducts() {
    throw new Error("getProducts not implemented");
  }

  async getCustomerAddresses(customerCode) {
    throw new Error("getCustomerAddresses not implemented");
  }

  async getDashboardData(userContext) {
    throw new Error("getDashboardData not implemented");
  }

  // ── Inventory methods (B2B) ──────────────────────────
  async getStock(filters = {}) { throw new Error("getStock not implemented"); }
  async getAllDeliveries(req)   { throw new Error("getAllDeliveries not implemented"); }
  async getDeliveryDetail(id, user)   { throw new Error("getDeliveryDetail not implemented"); }

  // ── Sales ────────────────────────────────────────────
  async getAllOrders(req)       { throw new Error("getAllOrders not implemented"); }
  async getOrderDetail(id, user)      { throw new Error("getOrderDetail not implemented"); }
  async getAllQuotes(req)       { throw new Error("getAllQuotes not implemented"); }
  async getQuoteDetail(id, user)      { throw new Error("getQuoteDetail not implemented"); }
  async getAllInvoices(req)     { throw new Error("getAllInvoices not implemented"); }
  async getInvoiceDetail(id, user)    { throw new Error("getInvoiceDetail not implemented"); }
  async getPendingInvoices(req){ throw new Error("getPendingInvoices not implemented"); }

  // ── Products / Categories ─────────────────────────────
  async getProductCategories() { throw new Error("getProductCategories not implemented"); }
  async getStockMovements(f)   { return []; }
  async getAllCreditNotes(r)    { return []; }
  async getAllSites()           { throw new Error("getAllSites not implemented"); }
  async getSupplierAddresses(code) { throw new Error("getSupplierAddresses not implemented"); }

  // ── Dashboard ─────────────────────────────────────────
  async getDashboardStats(user){ throw new Error("getDashboardStats not implemented"); }
}

module.exports = BaseERPAdapter;
