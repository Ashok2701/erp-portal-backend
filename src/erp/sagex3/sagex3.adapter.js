const BaseERPAdapter = require("../base.adapter");
const SageX3DB = require("./sagex3.db");
const SageX3SOAP = require("./sagex3.soap");

class SageX3Adapter extends BaseERPAdapter {
  constructor(conn) {
    super();
    this.conn = conn;
    this.mode = conn.connection_mode;
  }

  getCustomers() {
    return SageX3DB.getCustomers(this.conn);
  }

  getSuppliers() {
    return SageX3DB.getSuppliers(this.conn);
  }

  getProducts() {
    return SageX3DB.getProducts(this.conn);
  }

  getCustomerAddresses(code) {
    return SageX3DB.getCustomerAddresses(this.conn, code);
  }

  getDashboardData(context) {
    return SageX3DB.getDashboardData(this.conn, context.erp_entity_code);
  }

  createSalesOrder(orderData) {
    return SageX3SOAP.createSalesOrder(this.conn, orderData);
  }
}

module.exports = SageX3Adapter;