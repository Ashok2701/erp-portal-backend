const ERPFactory = require("../erp/erp.factory");
const pricingEngine = require("../utils/pricing.engine");

// Products + price lists change rarely (typically once per ERP sync), but
// were being re-fetched from the ERP database — plus a full product-image
// scan — on every single page load or refresh. A short in-memory TTL cache
// per tenant+filter combo turns repeat navigations into an instant lookup
// instead of a multi-second ERP round trip. TTL expiry is enough here;
// there is no live "catalog changed" event to invalidate on, but
// clearProductsCache() below is called whenever a tenant's ERP connection
// settings change, so a reconfigured connection never serves stale data.
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const productsCache = new Map(); // `${tenant_id}::${filtersJSON}` -> { data, expiresAt }

exports.clearProductsCache = (tenantId) => {
  if (!tenantId) { productsCache.clear(); return; }
  const prefix = `${tenantId}::`;
  for (const key of productsCache.keys()) {
    if (key.startsWith(prefix)) productsCache.delete(key);
  }
};

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


exports.getCustomers = async (user, filters = {}) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getCustomers(filters);
};

exports.getSuppliers = async (user) => {

   const adapter = await ERPFactory.getERPAdapterForUser(user);

   return adapter.getSuppliers();
};


exports.getProducts =
  async (filters, user) => {

    const cacheKey = `${user.tenant_id}::${JSON.stringify(filters || {})}`;
    const cached = productsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

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

    productsCache.set(cacheKey, { data: result, expiresAt: Date.now() + PRODUCTS_CACHE_TTL_MS });

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


exports.getProductCategories = async (user) => {
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