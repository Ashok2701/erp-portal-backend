const pool = require("../config/db");

exports.createSalesRequest = async (client, data) => {
  const result = await client.query(
    `
    INSERT INTO sales_request (
      sales_request_id,
      tenant_id,
      user_id,
      request_number,
      request_date,
      erp_customer_id,
      erp_site_code,
      erp_carrier_code,
      erp_delivery_method,
      drop_type,
      reference,
      status,
      comments,
       total_quantity,
      total_amount
    )
    VALUES (
      gen_random_uuid(),
      $1, $2,
      'SR-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(nextval('sales_request_seq')::text, 6, '0'),
      now(),
      $3, $4, $5, $6,
      $7, $8,
      'REQUEST_CREATED',
      $9,
      $10,
      $11
    )
    RETURNING sales_request_id
    `,
    [
      data.tenant_id,
      data.user_id,
      data.erp_customer_id,
      data.erp_site_code,
      data.erp_carrier_code,
      data.erp_delivery_method,
      data.drop_type,
      data.reference,
      data.comments,
      data.total_quantity,
      data.total_amount
    ]
  );

  return result.rows[0];
};

exports.insertItems = async (client, salesRequestId, items) => {
  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    const lineAmount = quantity * unitPrice;

    await client.query(
      `
      INSERT INTO sales_request_items (
        item_id,
        sales_request_id,
        product_category,
        product_code,
        product_description,
        quantity,
        unit_of_measure,
        unit_price,
        line_amount
      )
      VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      `,
      [
        salesRequestId,
        item.product_category,
        item.product_code,
        item.product_description,
        quantity,
        item.unit_of_measure,
        unitPrice,
        lineAmount
      ]
    );
  }
};

exports.insertAddress = async (client, requestId, address) => {
  await client.query(
    `
    INSERT INTO sales_request_address (
      address_id,
      sales_request_id,
      erp_address_id,
      customer_name,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country
    )
    VALUES (
      gen_random_uuid(),
       $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    `,
    [
      requestId,
      address.erp_address_id || 'SAGE X3',
      address.customer_name,
      address.address_line1,
      address.address_line2,
      address.city,
      address.state,
      address.postal_code,
      address.country
    ]
  );
};

exports.insertStatusHistory = async (client, requestId, userId, status) => {
  await client.query(
    `
    INSERT INTO sales_request_status_history (
      history_id,
      sales_request_id,
      status,
      changed_by
    )
    VALUES (
      gen_random_uuid(),
      $1, $2, $3
    )
    `,
    [requestId, status, userId]
  );
};

exports.updateAfterErp = async (
  requestId,
  status,
  erpSalesOrderId
) => {
  await pool.query(
    `
    UPDATE sales_request
    SET status = $1,
        erp_sales_order_id = $2
    WHERE sales_request_id = $3
    `,
    [status, erpSalesOrderId, requestId]
  );
};


// to get sales request by User
exports.getSalesRequestsByUser = async (userId) => {
  const result = await pool.query(
    `
    SELECT
      sales_request_id,
      request_number,
      request_date,
      status,
      erp_sales_order_id,
      total_quantity,
      total_amount
    FROM sales_request
    WHERE user_id = $1
    ORDER BY request_date DESC
    `,
    [userId]
  );

  return result.rows;
};


// Admin / Reporter – all requests
exports.getAllSalesRequests = async () => {
  const result = await pool.query(
    `
    SELECT
      sr.sales_request_id,
      sr.request_number,
      sr.request_date,
      sr.status,
      sr.erp_sales_order_id,
      sr.total_quantity,
      sr.total_amount,
      u.username
    FROM sales_request sr
    JOIN users u ON sr.user_id = u.user_id
    ORDER BY sr.request_date DESC
    `
  );

  return result.rows;
};



// to get details of sales request

exports.getSalesRequestHeader = async (salesRequestId) => {
  const result = await pool.query(
    `
    SELECT
      sr.sales_request_id,
      sr.request_number,
      sr.request_date,
      sr.status,
      sr.erp_sales_order_id,
      sr.total_quantity,
      sr.total_amount,
      sr.reference,
      sr.comments,
      u.user_id,
      u.username
    FROM sales_request sr
    JOIN users u ON sr.user_id = u.user_id
    WHERE sr.sales_request_id = $1
    `,
    [salesRequestId]
  );

  return result.rows[0];
};

exports.getSalesRequestItems = async (salesRequestId) => {
  const result = await pool.query(
    `
    SELECT
      product_category,
      product_code,
      product_description,
      quantity,
      unit_of_measure,
      unit_price,
      line_amount
    FROM sales_request_items
    WHERE sales_request_id = $1
    `,
    [salesRequestId]
  );

  return result.rows;
};

exports.getSalesRequestAddress = async (salesRequestId) => {
  const result = await pool.query(
    `
    SELECT
      customer_name,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country
    FROM sales_request_address
    WHERE sales_request_id = $1
    `,
    [salesRequestId]
  );

  return result.rows[0];
};

