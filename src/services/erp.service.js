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


exports.getCustomers = async (user) => {

   const adapter = await ERPFactory.getERPAdapterForUser(user);

   return adapter.getCustomers();
};

exports.getSuppliers = async (user) => {

   const adapter = await ERPFactory.getERPAdapterForUser(user);

   return adapter.getSuppliers();
};


exports.getProducts =
  async (filters, user) => {

    const adapter =
      await ERPFactory.getERPAdapterForUser(user);

    console.time("TOTAL_PRODUCTS");

    console.time("GET_PRODUCTS");

    const products =
      await adapter.getProducts(filters);

    console.timeEnd("GET_PRODUCTS");

    console.time("GET_PRICELISTS");

    const pricingRows =
      await adapter.getPriceLists(filters);

    console.timeEnd("GET_PRICELISTS");

    console.time("BUILD_INDEX");

    const pricingIndex =
      pricingEngine.buildPricingIndex(
        pricingRows
      );

    console.timeEnd("BUILD_INDEX");

    console.time("MAP_PRODUCTS");

    const result =
      products.map(product => {

        const price =
          pricingEngine.resolvePrice({

            product,

            customer:
              filters.customer,

            quantity:
              filters.quantity || 1,

            pricingIndex
          });

        return {

          ...product,

          BASE_PRICE:
            price.basePrice,

          DISCOUNT:
            price.discount,

          FINAL_PRICE:
            price.finalPrice,

          PRICE_SOURCE:
            price.source
        };
      });

    console.timeEnd("MAP_PRODUCTS");

    console.timeEnd("TOTAL_PRODUCTS");

    return result;
};

exports.getProducts_2 =
  async (filters) => {

    const adapter =
      await ERPFactory.getERPAdapterForUser(user);

    // -----------------------------
    // LOAD DATA
    // -----------------------------

    const [
      products,
      pricingRows
    ] = await Promise.all([

      adapter.getProducts(filters),

      adapter.getPriceLists(filters)
    ]);

    const pricingIndex =
      pricingEngine.buildPricingIndex(
        pricingRows
      );

    // -----------------------------
    // FINAL PRODUCTS
    // -----------------------------

    return products.map(product => {

      const price =
        pricingEngine.resolvePrice({

          product,

          customer:
            filters.customer,

          quantity:
            filters.quantity || 1,

          pricingIndex
        });

      return {

        ...product,

        BASE_PRICE:
          price.basePrice,

        DISCOUNT:
          price.discount,

        FINAL_PRICE:
          price.finalPrice,

        PRICE_SOURCE:
          price.source
      };
    });
};


exports.getProductCategories = async () => {
//  const connection = await getERPConnection(tenantId);

  const adapter = await ERPFactory.getERPAdapterForUser(user);

  return adapter.getProductCategories();
};


exports.getCustomerAddresses = async (customerCode, user) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getCustomerAddresses(customerCode);
};

exports.getSupplierAddresses = async (supplierCode, user) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getSupplierAddresses(supplierCode);
};


// STOCK

exports.getStock = async (filters, user) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getStock(filters);
};

// SITES

exports.getAllSites = async (user) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getAllSites();
};