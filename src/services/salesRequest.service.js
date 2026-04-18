const db = require("../config/db");
const emailService = require("./email.service");

async function generateRequestNumber(client) {
  const seq = await client.query(
    `UPDATE request_sequence
     SET last_number = last_number + 1
     RETURNING last_number`
  );

  const number = seq.rows[0].last_number;
  return `REQS${String(number).padStart(8, "0")}`;
}

exports.create = async (user, body) => {

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const dropRequestId = await generateRequestNumber(client);

    let totalAmount = 0;
    let totalQty = 0;

    // calculate totals
    body.items.forEach(item => {
      const amt = item.price * item.quantity;
      totalAmount += amt;
      totalQty += Number(item.quantity);
    });

    // insert header
    await client.query(
      `INSERT INTO sales_requests
       (drop_request_id, user_id, site, customer_code, reference, currency,
        total_amount, total_qty, comment, address, carrier, mode, request_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, $13)`,
      [
        dropRequestId,
        user.user_id,
        body.site,
        body.customer_code,
        body.reference,
        body.currency,
        totalAmount,
        totalQty,
        body.comment,
        body.address,
        body.carrier,
        body.mode,
        body.request_date
      ]
    );

    // insert items
    let lineNo = 1;

    for (const item of body.items) {
      const lineAmount = item.price * item.quantity;

      await client.query(
        `INSERT INTO sales_request_items
         (drop_request_id, line_no, product_code, prod_desc,
          quantity, price, line_amount, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          dropRequestId,
          lineNo++,
          item.product_code,
          item.prod_desc,
          item.quantity,
          item.price,
          lineAmount,
          user.user_id
        ]
      );
    }

    await client.query("COMMIT");

 // EMAIL TRIGGER AFTER SALES REQUEST CREATION


    // Inside create(), after COMMIT and before return:
    // Fetch customer email
    const customerResult = await db.query(
      'SELECT email FROM users WHERE user_id = $1', [user.user_id]
    );
    const customerEmail = customerResult.rows[0]?.email;

    // Send emails (async, don't await to avoid blocking)
    emailService.sendSalesRequestConfirmation(customerEmail, {
      drop_request_id: dropRequestId,
      customer_code: body.customer_code,
      items: body.items,
      total_amount: totalAmount,
    }).catch(() => {});

    emailService.sendSalesRequestAdminAlert({
      drop_request_id: dropRequestId,
      customer_code: body.customer_code,
      items: body.items,
      total_amount: totalAmount,
      address: body.address,
    }).catch(() => {});
// END OF EMAIL TRIGGER

    return {
      message: "Sales Request Created",
      drop_request_id: dropRequestId
    };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

exports.getAll = async (user) => {
  console.log("at service request - user details");
  console.log(user);


  let query;
  let params = [];

if (user.role === "Administrator") {
    // Admin gets all records
    query = `
      SELECT * FROM sales_requests
      ORDER BY created_time DESC
    `;
  } else {
    // Normal user gets only their records
    query = `
      SELECT * FROM sales_requests
      WHERE user_id = $1
      ORDER BY created_time DESC
    `;
    params = [user.user_id];
  }


  const result = await db.query(
    `SELECT * FROM sales_requests
     WHERE user_id=$1
     ORDER BY created_time DESC`,
    [user.user_id]
  );

   const result = await db.query(query, params);
    return result.rows;
};


exports.getById = async (dropRequestId) => {

  const header = await db.query(
    `SELECT * FROM sales_requests WHERE drop_request_id=$1`,
    [dropRequestId]
  );

  if (header.rows.length === 0) {
    throw new Error("Sales Request not found");
  }

  const items = await db.query(
    `SELECT * FROM sales_request_items WHERE drop_request_id=$1`,
    [dropRequestId]
  );

  return {
    header: header.rows[0],
    items: items.rows
  };
};

exports.update = async (dropRequestId, body) => {

  await db.query(
    `UPDATE sales_requests
     SET comment=$1,
         address=$2,
         reference=$3,
         currency=$4,
         request_date=$5
     WHERE drop_request_id=$5`,
    [
      body.comment,
      body.address,
      body.reference,
      body.currency,
      body.request_date,
      dropRequestId
    ]
  );

  return { message: "Sales Request Updated" };
};

exports.remove = async (dropRequestId) => {

  await db.query(
    `DELETE FROM sales_request_items WHERE drop_request_id=$1`,
    [dropRequestId]
  );

  await db.query(
    `DELETE FROM sales_requests WHERE drop_request_id=$1`,
    [dropRequestId]
  );
};