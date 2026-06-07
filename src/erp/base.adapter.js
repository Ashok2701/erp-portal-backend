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
  // filters: { site, product, category, warehouse }
  async getStock(filters = {}) {
    throw new Error("getStock not implemented");
  }

  // req: { user: { customerCode, site, role } }
  async getAllDeliveries(req) {
    throw new Error("getAllDeliveries not implemented");
  }
}

module.exports = BaseERPAdapter;
