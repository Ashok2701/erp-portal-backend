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
