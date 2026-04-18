const db = require("../config/db");
const emailService = require("./email.service");
const axios = require("axios");

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


// generate Order from Request
exports.generateOrder = async (user, requestIds) => {
  if (!requestIds || requestIds.length === 0) throw new Error("No request IDs provided");

  console.log("requestIds", requestIds);
  console.log("user", user);

  const results = [];

  for (const dropRequestId of requestIds) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Fetch request header
      const header = await client.query(
        "SELECT * FROM sales_requests WHERE drop_request_id = $1",
        [dropRequestId]
      );
      if (header.rows.length === 0) {
        results.push({ drop_request_id: dropRequestId, success: false, error: "Not found" });
        await client.query("ROLLBACK");
        continue;
      }

      const sr = header.rows[0];

      // Fetch items
      const items = await client.query(
        "SELECT * FROM sales_request_items WHERE drop_request_id = $1 ORDER BY line_no",
        [dropRequestId]
      );

      // Build SOH line items XML
      const lineItems = items.rows.map((item, idx) => `
              <LIN>
                <FLD NAME="ITMREF">${item.product_code}</FLD>
                <FLD NAME="QTY">${parseFloat(item.quantity) || 1}</FLD>
                <FLD NAME="GROPRI">${parseFloat(item.price) || 0}</FLD>
                <FLD NAME="SAU">${item.uom || 'EA'}</FLD>
              </LIN>`).join("");

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const dlvDate = sr.request_date
        ? new Date(sr.request_date).toISOString().slice(0, 10).replace(/-/g, '')
        : today;

      // Build standard SOH SOAP XML
      const soapXml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wss="http://www.adonix.com/WSS"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <wss:save soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <callContext xsi:type="wss:CAdxCallContext">
        <codeLang xsi:type="xsd:string">ENG</codeLang>
        <poolAlias xsi:type="xsd:string">${process.env.X3_POOL_ALIAS || 'TMSNEW'}</poolAlias>
        <requestConfig xsi:type="xsd:string">adxwss.optreturn=XML&amp;adxwss.beautify=true</requestConfig>
      </callContext>
      <publicName xsi:type="xsd:string">SOH</publicName>
      <objectKeys xsi:type="wss:ArrayOfCAdxParamKeyValue" />
      <inputXml xsi:type="xsd:string"><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<PARAM>
  <GRP ID="SOH0_1">
    <FLD NAME="SAESSION">${sr.site || process.env.X3_SALES_SITE || '1100'}</FLD>
    <FLD NAME="SOHTYP">${process.env.X3_ORDER_TYPE || 'SOI'}</FLD>
  </GRP>
  <GRP ID="SOH0_2">
    <FLD NAME="BPCORD">${sr.customer_code}</FLD>
    <FLD NAME="ORDDAT">${today}</FLD>
    <FLD NAME="DEESSION">${dlvDate}</FLD>
    <FLD NAME="CUR">${sr.currency || 'USD'}</FLD>
    <FLD NAME="BPAADD">${sr.address || ''}</FLD>
    <FLD NAME="PJTH">${sr.reference || ''}</FLD>
  </GRP>
  <TAB ID="SOH1_1" SIZE="${items.rows.length}">
    ${lineItems}
  </TAB>
</PARAM>
]]></inputXml>
    </wss:save>
  </soapenv:Body>
</soapenv:Envelope>`;

      // Update status to PROCESSING
      await client.query(
        "UPDATE sales_requests SET status = 'PROCESSING' WHERE drop_request_id = $1",
        [dropRequestId]
      );

      await client.query("COMMIT");

      // Call Sage X3 SOAP
      const x3Url = process.env.X3_SOAP_URL;
      if (x3Url) {
        try {
          console.log(`📤 Sending SOH to X3 for ${dropRequestId}...`);

          const x3Response = await axios.post(x3Url, soapXml, {
            headers: {
              "Content-Type": "text/xml; charset=utf-8",
              "SOAPAction": ""
            },
            auth: {
              username: process.env.X3_USERNAME,
              password: process.env.X3_PASSWORD,
            },
            timeout: 60000,
          });

          const responseData = x3Response.data;
          console.log(`📥 X3 Response for ${dropRequestId}:`, responseData.substring(0, 500));

          // Parse order number from X3 response
          // Standard SOH save returns SOHNUM in resultXml
          const sohNumMatch = responseData.match(/NAME="SOHNUM"[^>]*>([^<]+)</)
            || responseData.match(/SOHNUM[^>]*>([^<]+)</)
            || responseData.match(/<FLD[^>]+SOHNUM[^>]*>([^<]+)</);
          const erpOrderNo = sohNumMatch?.[1]?.trim() || null;

          // Check for errors in response
          const hasError = responseData.includes('<status>0</status>')
            || responseData.includes('severity="3"')
            || responseData.includes('severity="4"');

          const errorMatch = responseData.match(/<message>(.*?)<\/message>/);
          const errorMsg = errorMatch?.[1] || null;

          if (erpOrderNo && !hasError) {
            await db.query(
              "UPDATE sales_requests SET status = 'ORDER GENERATED', erp_order_no = $1 WHERE drop_request_id = $2",
              [erpOrderNo, dropRequestId]
            );
            console.log(`✅ Order generated: ${erpOrderNo} for ${dropRequestId}`);
            results.push({ drop_request_id: dropRequestId, success: true, erp_order_no: erpOrderNo, status: "ORDER GENERATED" });

            // Send email notification
            try {
              const emailService = require("./email.service");
              const custResult = await db.query('SELECT email FROM users WHERE user_id = $1', [sr.user_id]);
              if (custResult.rows[0]?.email) {
                emailService.sendStatusUpdateEmail(custResult.rows[0].email, {
                  drop_request_id: dropRequestId,
                  status: "ORDER GENERATED",
                  erp_order_no: erpOrderNo,
                  customer_code: sr.customer_code
                }).catch(() => {});
              }
            } catch {}
          } else {
            console.error(`❌ X3 error for ${dropRequestId}:`, errorMsg || 'Unknown error');
             await db.query(
                          "UPDATE sales_requests SET status = 'DRAFT' WHERE drop_request_id = $1",
                          [dropRequestId]
                        );
            results.push({ drop_request_id: dropRequestId, success: false, error: errorMsg || "X3 processing error", status: "PROCESSING" });
          }
        } catch (x3Err) {
          console.error(`❌ X3 connection error for ${dropRequestId}:`, x3Err.message);
          await db.query(
            "UPDATE sales_requests SET status = 'DRAFT' WHERE drop_request_id = $1",
            [dropRequestId]
          );
          results.push({ drop_request_id: dropRequestId, success: false, error: "X3 connection failed: " + x3Err.message });
        }
      } else {
        results.push({ drop_request_id: dropRequestId, success: true, status: "PROCESSING", note: "X3 not configured" });
      }

    } catch (err) {
      await client.query("ROLLBACK");
      results.push({ drop_request_id: dropRequestId, success: false, error: err.message });
    } finally {
      client.release();
    }
  }

  return { processed: results.length, results };
};

