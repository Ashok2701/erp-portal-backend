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
}

module.exports = BaseERPAdapter;
