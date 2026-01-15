const pool = require("../config/db");
const SalesRequestModel = require("../models/salesRequest.model");
const ErpService = require("../services/erp.service");

exports.createSalesRequest = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      items,
      address,
      reference,
      comments,
      erp_site_code,
      erp_carrier_code,
      erp_delivery_method,
      drop_type
    } = req.body;

    const { user_id, tenant_id } = req.user;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Items are required" });
    }

    if (!address) {
      return res.status(400).json({ message: "Address is required" });
    }

    // 🔹 Get ERP Mapping
    const mappingRes = await pool.query(
      `
      SELECT erp_entity_code
      FROM user_erp_mapping
      WHERE user_id = $1 AND is_active = true
      `,
      [user_id]
    );

    if (mappingRes.rows.length === 0) {
      return res.status(400).json({ message: "ERP mapping not found" });
    }

    const erpCustomerId = mappingRes.rows[0].erp_entity_code;

    // 🔹 Calculate totals
    let totalQty = 0;
    let totalAmt = 0;

    items.forEach(i => {
      totalQty += Number(i.quantity);
      totalAmt += Number(i.quantity) * Number(i.unit_price);
    });

    await client.query("BEGIN");

    // 🔹 Create Sales Request
    const request = await SalesRequestModel.createSalesRequest(client, {
      tenant_id,
      user_id,
      erp_customer_id: erpCustomerId,
      erp_site_code,
      erp_carrier_code,
      erp_delivery_method,
      drop_type: drop_type || "SALES",
      reference,
      comments,
      total_quantity: totalQty,
      total_amount: totalAmt
    });

    // 🔹 Insert Items
    await SalesRequestModel.insertItems(
      client,
      request.sales_request_id,
      items
    );

    // 🔹 Insert Address
    await SalesRequestModel.insertAddress(
      client,
      request.sales_request_id,
      address
    );

    await client.query("COMMIT");

    // 🔹 ERP CALL (Outside transaction)
    const erpResult = await ErpService.createSalesOrder({
      sales_request_id: request.sales_request_id
    });

    if (erpResult.success) {
      await SalesRequestModel.updateAfterErp(
        request.sales_request_id,
        "ORDER_GENERATED",
        erpResult.erp_sales_order_id
      );
    } else {
      await SalesRequestModel.updateAfterErp(
        request.sales_request_id,
        "ERP_FAILED",
        null
      );
    }

    res.status(201).json({
      message: "Sales request created successfully",
      sales_request_id: request.sales_request_id,
       request_number: request.request_number
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CREATE SALES REQUEST ERROR:", err);
    res.status(500).json({ message: "Failed to create sales request" });
  } finally {
    client.release();
  }
};

const mapStatusForCustomer = (status) => {
  switch (status) {
    case "REQUEST_CREATED":
      return "Request Created";
    case "ORDER_GENERATED":
      return "Order Generated";
    case "DELIVERY_SCHEDULED":
      return "Delivery Scheduled";
    case "COMPLETED":
      return "Completed";
    default:
      return status;
  }
};



exports.listSalesRequests = async (req, res) => {
  try {
    const { user_id } = req.user;

    // 🔹 Fetch roles
    const roleRes = await pool.query(
      `
      SELECT r.role_code
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
      `,
      [user_id]
    );

    const roles = roleRes.rows.map(r => r.role_code);

    let requests;

    // 🔹 Admin / Reporter → all requests
    if (roles.includes("ADMIN") || roles.includes("REPORTER")) {
      requests = await SalesRequestModel.getAllSalesRequests();
    } 
    // 🔹 Customer / Supplier → own requests
    else {
      requests = await SalesRequestModel.getSalesRequestsByUser(user_id);
    }

    const response = requests.map(r => ({
      sales_request_id: r.sales_request_id,
      request_number: r.request_number,
      request_date: r.request_date,
      status: mapStatusForCustomer(r.status),
      erp_sales_order_id: r.erp_sales_order_id,
      total_quantity: r.total_quantity,
      total_amount: r.total_amount,
      username: r.username || undefined // only for admin
    }));

    res.json({ sales_requests: response });

  } catch (err) {
    console.error("LIST SALES REQUESTS ERROR:", err);
    res.status(500).json({ message: "Failed to load sales requests" });
  }
};


exports.getSalesRequestDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    // 🔹 Fetch header
    const header = await SalesRequestModel.getSalesRequestHeader(id);

    if (!header) {
      return res.status(404).json({ message: "Sales request not found" });
    }

    // 🔹 Get user roles
    const roleRes = await pool.query(
      `
      SELECT r.role_code
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = $1
      `,
      [user_id]
    );

    const roles = roleRes.rows.map(r => r.role_code);

    // 🔹 Access control
    if (
      (roles.includes("CUSTOMER") || roles.includes("SUPPLIER")) &&
      header.user_id !== user_id
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // 🔹 Fetch items & address
    const items = await SalesRequestModel.getSalesRequestItems(id);
    const address = await SalesRequestModel.getSalesRequestAddress(id);

    res.json({
      sales_request: {
        sales_request_id: header.sales_request_id,
        request_number: header.request_number,
        request_date: header.request_date,
        status: mapStatusForCustomer(header.status),
        erp_sales_order_id: header.erp_sales_order_id,
        total_quantity: header.total_quantity,
        total_amount: header.total_amount,
        reference: header.reference,
        comments: header.comments,
        customer: roles.includes("ADMIN") ? header.username : undefined,
        address,
        items
      }
    });

  } catch (err) {
    console.error("GET SALES REQUEST DETAILS ERROR:", err);
    res.status(500).json({ message: "Failed to load sales request details" });
  }
};




