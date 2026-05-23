const ERPFactory = require("../erp/erp.factory");
const pricingEngine = require("../utils/pricing.engine");

exports.createSalesOrder = async (salesRequest) => {
  // 🔴 DEMO / MOCK IMPLEMENTATION
  // Later this will call Sage X3 API

  console.log("Calling ERP API for request:", salesRequest.sales_request_id);

  // Simulate ERP success
  return {
    success: true,
    erp_order_no: "SO-" + Math.floor(Math.random() * 100000)
  };

  // To simulate failure, return:
  // return { success: false, error: "ERP timeout" };
};


exports.getCustomers = async () => {

   const adapter = ERPFactory.getERPAdapter();

   return adapter.getCustomers();
};

exports.getSuppliers = async () => {

   const adapter = ERPFactory.getERPAdapter();

   return adapter.getSuppliers();
};

exports.getProducts = async (filters) => {
  //const connection = await getERPConnection(tenantId);

   const adapter = ERPFactory.getERPAdapter(filters);

  return   adapter.getProducts(filters)

/*
  // Parallel loading
      const [
        products,
        stocks,
        pricingRules
      ] = await Promise.all([

        adapter.getProducts(filters),

        adapter.getStocks(filters),

        adapter.getPricingRules(filters)
      ]);

      // Build stock map
      const stockMap = {};

      for (const stock of stocks) {

        stockMap[
          stock.ITMREF_0
        ] = stock.QTY;
      }

      // Apply pricing
      const finalProducts =
        products.map(product => {

          const pricing =
            pricingEngine.resolvePrice({

              product,

              customer:
                filters.customer,

              pricingRules
            });

          return {

            ...product,

            STOCK:
              stockMap[
                product.PROD_CODE
              ] || 0,

            PRICE:
              pricing.price,

            PRICE_SOURCE:
              pricing.source
          };
        });

      return finalProducts;
      */
};

exports.getProductCategories = async () => {
//  const connection = await getERPConnection(tenantId);

  const adapter = ERPFactory.getERPAdapter();

  return adapter.getProductCategories();
};


exports.getCustomerAddresses = async (customerCode) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getCustomerAddresses(customerCode);
};

exports.getSupplierAddresses = async (supplierCode) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getSupplierAddresses(supplierCode);
};


// STOCK

exports.getStock = async (filters) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getStock(filters);
};