const db = require("../config/db");
const emailService = require("./email.service");
const axios = require("axios");
const { getSoapClient } = require("../utils/soapClient");
const soap = require("soap");
const https = require("https");

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
exports.generateOrder_oldone = async (user, requestIds) => {
  if (!requestIds || requestIds.length === 0) throw new Error("No request IDs provided");

  console.log("requestIds", requestIds);
  console.log("user", user);
  console.log("X3 details", process.env.X3_SOAP_URL);
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

exports.generateOrder = async (user, requestIds) => {
  try {
    if (!requestIds || requestIds.length === 0) {
      throw new Error("No request IDs provided");
    }

    const results = [];

    // ============================================
    // SOAP CALL CONTEXT
    // ============================================

    const callContext = `
<codeLang xsi:type="xsd:string">ENG</codeLang>
<poolAlias xsi:type="xsd:string">${process.env.X3_POOL_ALIAS.trim()}</poolAlias>
<poolId xsi:type="xsd:string">${process.env.X3_POOL_ALIAS.trim()}</poolId>
<requestConfig xsi:type="xsd:string">adxwss.optreturn=XML</requestConfig>
`;

    // ============================================
    // CREATE SOAP CLIENT
    // ============================================

    const client = await soap.createClientAsync(
      process.env.X3_WSDL_URL,
      {
        attributesKey: "attributes",
        valueKey: "$value",
        xmlKey: "$xml",

        wsdl_options: {
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
        },
      }
    );

    // ============================================
    // BASIC AUTH
    // ============================================

    client.setSecurity(
      new soap.BasicAuthSecurity(
        process.env.X3_USERNAME,
        process.env.X3_PASSWORD,
        ""
      )
    );

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // ============================================
    // PROCESS EACH REQUEST
    // ============================================

    for (const dropRequestId of requestIds) {
      const clientDb = await db.connect();

      try {
        await clientDb.query("BEGIN");

        // ============================================
        // FETCH HEADER
        // ============================================

        const header = await clientDb.query(
          `
          SELECT *
          FROM sales_requests
          WHERE drop_request_id = $1
          `,
          [dropRequestId]
        );

        if (header.rows.length === 0) {
          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: "Sales request not found",
          });

          await clientDb.query("ROLLBACK");
          continue;
        }

        const sr = header.rows[0];

        // ============================================
        // FETCH ITEMS
        // ============================================

        const items = await clientDb.query(
          `
          SELECT *
          FROM sales_request_items
          WHERE drop_request_id = $1
          ORDER BY line_no
          `,
          [dropRequestId]
        );

        if (items.rows.length === 0) {
          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: "No items found",
          });

          await clientDb.query("ROLLBACK");
          continue;
        }

        // ============================================
        // FORMAT DATE YYYYMMDD
        // ============================================

        const formatDate = (date) => {
          const d = new Date(date);

          return (
            d.getFullYear() +
            String(d.getMonth() + 1).padStart(2, "0") +
            String(d.getDate()).padStart(2, "0")
          );
        };

        // ============================================
        // ORDER DATE
        // ============================================

        const orderDate = formatDate(
          sr.request_date || new Date()
        );

        // ============================================
        // DELIVERY DATE
        // IF NO DELIVERY DATE -> USE ORDER DATE
        // ============================================

        const deliveryDate = sr.delivery_date
          ? formatDate(sr.delivery_date)
          : orderDate;

        // ============================================
        // BUILD LINE XML
        // ============================================

        let lineXml = "";

        items.rows.forEach((item, index) => {
          lineXml += `
<LIN NUM="${index + 1}">
<FLD NAME="I_XITMREF" TYPE="Char">${item.product_code}</FLD>
<FLD NAME="I_XQTY" TYPE="Decimal">${parseFloat(item.quantity) || 1}</FLD>
<FLD NAME="I_XUOM" TYPE="Char">${item.uom || "UN"}</FLD>
<FLD NAME="I_XGROPRI" TYPE="Decimal">${parseFloat(item.price) || 0}</FLD>
</LIN>`;
        });

        // ============================================
        // BUILD XML BODY
        // ============================================

        const xmlBody = `
<PARAM>

<GRP ID="GRP1">

<FLD NAME="I_XFLAG" TYPE="Integer">0</FLD>
<FLD NAME="I_XFLG" TYPE="Integer">0</FLD>
<FLD NAME="I_XVCRNUM" TYPE="Char"></FLD>
<FLD NAME="I_XFCY" TYPE="Char">${sr.site || process.env.X3_SALES_SITE}</FLD>
<FLD NAME="I_XBPCNUM" TYPE="Char">${sr.customer_code}</FLD>
<!-- DEFAULT ADDRESS -->
<FLD NAME="I_XADR" TYPE="Char">${sr.address || "10"}</FLD>
<FLD NAME="I_XORDDAT" TYPE="Date">${orderDate}</FLD>
<!-- IF DELIVERY DATE NOT AVAILABLE USE ORDER DATE -->
<FLD NAME="I_XDLVDAT" TYPE="Date">${deliveryDate}</FLD>
<!-- IF SHIP DATE NOT AVAILABLE USE ORDER DATE -->
<FLD NAME="I_XSHIDAT" TYPE="Date">${deliveryDate}</FLD>
<FLD NAME="I_XUSERID" TYPE="Char">${user?.username || "ADMIN"}</FLD>
<FLD NAME="I_XMDL" TYPE="Char"></FLD>
<FLD NAME="I_XCOMMENTS" TYPE="Char">${sr.comments || "SOAP TEST ORDER"}</FLD>
<FLD NAME="I_XPONUM" TYPE="Char">${sr.po_number || ""}</FLD>
<FLD NAME="I_XORDTYP" TYPE="Char">${sr.order_type || process.env.X3_ORDER_TYPE}</FLD>
<FLD NAME="I_XUNIQUENO" TYPE="Char">${dropRequestId}</FLD>

</GRP>

<TAB ID="GRP2" DIM="500" SIZE="${items.rows.length}">
${lineXml}
</TAB>

</PARAM>
`;

        // ============================================
        // FINAL INPUT XML
        // ============================================

        const inputXml = `<![CDATA[${xmlBody}]]>`;

        console.log("=================================");
        console.log("INPUT XML");
        console.log("=================================");
        console.log(inputXml);

        // ============================================
        // UPDATE STATUS
        // ============================================

        await clientDb.query(
          `
          UPDATE sales_requests
          SET status = 'PROCESSING'
          WHERE drop_request_id = $1
          `,
          [dropRequestId]
        );

        await clientDb.query("COMMIT");

        // ============================================
        // SOAP REQUEST
        // ============================================

        const soapRequest = {
          callContext: {
            $xml: callContext,

            attributes: {
              "xsi:type": "wss:CAdxCallContext",
            },
          },

          publicName: {
            attributes: {
              "xsi:type": "xsd:string",
            },

            $value: "XPODCRESOH",
          },

          inputXml: {
            attributes: {
              "xsi:type": "xsd:string",
            },

            $value: inputXml,
          },
        };

        console.log("=================================");
        console.log("SOAP REQUEST");
        console.log("=================================");
        console.log(
          JSON.stringify(soapRequest, null, 2)
        );

        // ============================================
        // EXECUTE SOAP
        // ============================================

        const response = await new Promise(
          (resolve, reject) => {
            client.run(
              soapRequest,

              (error, resp) => {
                if (error) {
                  return reject(error);
                }

                resolve(resp);
              }
            );
          }
        );

        console.log("=================================");
        console.log("SOAP RESPONSE");
        console.log("=================================");
        console.log(
          JSON.stringify(response, null, 2)
        );

        // ============================================
        // RESULT XML
        // ============================================

        const responseXml =
          response?.runReturn?.resultXml?.$value || "";

        console.log("=================================");
        console.log("RESULT XML");
        console.log("=================================");
        console.log(responseXml);

        // ============================================
        // SOAP ERROR
        // ============================================

        const soapMessages =
          response?.runReturn?.messages;

        if (soapMessages) {
          const soapError =
            soapMessages?.message ||
            "SOAP Error";

          await db.query(
            `
            UPDATE sales_requests
            SET status = 'DRAFT'
            WHERE drop_request_id = $1
            `,
            [dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: soapError,
          });

          continue;
        }

        // ============================================
        // EXTRACT SOH NUMBER
        // ============================================

        const match =
          responseXml.match(
            /NAME="SOHNUM"[^>]*>([^<]+)</
          ) ||
          responseXml.match(
            /NAME="XSOHNUM"[^>]*>([^<]+)</
          );

        const erpOrderNo = match?.[1]?.trim();

        // ============================================
        // SUCCESS
        // ============================================

        if (erpOrderNo) {
          await db.query(
            `
            UPDATE sales_requests
            SET status = 'ORDER GENERATED',
                erp_order_no = $1
            WHERE drop_request_id = $2
            `,
            [erpOrderNo, dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: true,
            erp_order_no: erpOrderNo,
            status: "ORDER GENERATED",
          });

          console.log(
            `SUCCESS: ${dropRequestId} -> ${erpOrderNo}`
          );
        } else {
          await db.query(
            `
            UPDATE sales_requests
            SET status = 'DRAFT'
            WHERE drop_request_id = $1
            `,
            [dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: "SOHNUM not returned from Sage X3",
          });
        }
      } catch (err) {
        await clientDb.query("ROLLBACK");

        console.error("ORDER ERROR:", err);

        results.push({
          drop_request_id: dropRequestId,
          success: false,
          error: err.message,
        });
      } finally {
        clientDb.release();
      }
    }

    return {
      processed: results.length,
      results,
    };
  } catch (error) {
    console.error("GENERATE ORDER ERROR:", error);

    throw error;
  }
};



exports.generateOrder_3 = async (user, requestIds) => {
  if (!requestIds || requestIds.length === 0) {
    throw new Error("No request IDs provided");
  }

  const results = [];

    console.log("at generate order", requestIds )

  for (const dropRequestId of requestIds) {
    const clientDb = await db.connect();

    try {
      await clientDb.query("BEGIN");

      // Fetch Header
      const header = await clientDb.query(
        "SELECT * FROM sales_requests WHERE drop_request_id = $1",
        [dropRequestId]
      );

      if (header.rows.length === 0) {
        results.push({
          drop_request_id: dropRequestId,
          success: false,
          error: "Sales request not found",
        });

        await clientDb.query("ROLLBACK");
        continue;
      }

      const sr = header.rows[0];

      // Fetch Items
      const items = await clientDb.query(
        "SELECT * FROM sales_request_items WHERE drop_request_id = $1 ORDER BY line_no",
        [dropRequestId]
      );

      if (items.rows.length === 0) {
        results.push({
          drop_request_id: dropRequestId,
          success: false,
          error: "No items found",
        });

        await clientDb.query("ROLLBACK");
        continue;
      }

      // Dates
      const today = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

      const dlvDate = sr.request_date
        ? new Date(sr.request_date)
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "")
        : today;

      // Build XML Lines
      const lineItems = items.rows
        .map(
          (item, idx) => `
<LIN NUM="${idx + 1}">
  <FLD NAME="ITMREF">${item.product_code}</FLD>
  <FLD NAME="QTY">${parseFloat(item.quantity) || 1}</FLD>
  <FLD NAME="GROPRI">${parseFloat(item.price) || 0}</FLD>
  <FLD NAME="SAU">${item.uom || "EA"}</FLD>
</LIN>`
        )
        .join("");

      // IMPORTANT:
      // Keep CDATA compact
      const inputXml = `<![CDATA[
<PARAM>
  <GRP ID="SOH0_1">
    <FLD NAME="SALFCY">${sr.site || process.env.X3_SALES_SITE || "1100"}</FLD>
    <FLD NAME="SOHTYP">${process.env.X3_ORDER_TYPE || "SOI"}</FLD>
  </GRP>

  <GRP ID="SOH0_2">
    <FLD NAME="BPCORD">${sr.customer_code}</FLD>
    <FLD NAME="ORDDAT">${today}</FLD>
    <FLD NAME="DEMDLVDAT">${dlvDate}</FLD>
    <FLD NAME="CUR">${sr.currency || "USD"}</FLD>
    <FLD NAME="BPAADD">${sr.address || ""}</FLD>
    <FLD NAME="CUSORDREF">${sr.reference || ""}</FLD>
  </GRP>

  <TAB ID="SOH1_1" SIZE="${items.rows.length}">
    ${lineItems}
  </TAB>
</PARAM>
]]>`;

      // Update Status
      await clientDb.query(
        "UPDATE sales_requests SET status = 'PROCESSING' WHERE drop_request_id = $1",
        [dropRequestId]
      );

      await clientDb.query("COMMIT");

      try {
        console.log("=================================");
        console.log("Generating Order:", dropRequestId);
        console.log("=================================");

        // SOAP Client
        const soapClient = await getSoapClient();

        // SOAP Request
        const response = await new Promise((resolve, reject) => {
          soapClient.run(
            {
              callContext: {
                $xml: `
<codeLang xsi:type="xsd:string">ENG</codeLang>
<poolAlias xsi:type="xsd:string">${process.env.X3_POOL_ALIAS || "TMSNEW"}</poolAlias>
<requestConfig xsi:type="xsd:string">
adxwss.optreturn=XML
</requestConfig>
`,
                attributes: {
                  "xsi:type": "wss:CAdxCallContext",
                },
              },

              publicName: {
                attributes: {
                  "xsi:type": "xsd:string",
                },
                $value: "SOH",
              },

              inputXml: {
                attributes: {
                  "xsi:type": "xsd:string",
                },
                $xml: inputXml,
              },
            },

            (err, result) => {
              if (err) {
                console.error("SOAP METHOD ERROR:", err);
                return reject(err);
              }

              resolve(result);
            }
          );
        });

        console.log(
          "SOAP RESPONSE:",
          JSON.stringify(response, null, 2)
        );

        const respXml =
          response?.runReturn?.resultXml?.$value || "";

        console.log("RESULT XML:", respXml);

        // Check SOAP Messages
        const soapMessages = response?.runReturn?.messages;

        if (soapMessages?.length > 0) {
          const soapError =
            soapMessages[0]?.message || "SOAP Error";

          await db.query(
            "UPDATE sales_requests SET status = 'DRAFT' WHERE drop_request_id = $1",
            [dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: soapError,
          });

          continue;
        }

        // Extract SOHNUM
        const match =
          respXml.match(/NAME="SOHNUM"[^>]*>([^<]+)</) ||
          respXml.match(/SOHNUM[^>]*>([^<]+)</);

        const erpOrderNo = match?.[1]?.trim();

        if (erpOrderNo) {
          await db.query(
            `UPDATE sales_requests
             SET status = 'ORDER GENERATED',
                 erp_order_no = $1
             WHERE drop_request_id = $2`,
            [erpOrderNo, dropRequestId]
          );

          console.log(
            `SUCCESS: ${dropRequestId} -> ${erpOrderNo}`
          );

          results.push({
            drop_request_id: dropRequestId,
            success: true,
            erp_order_no: erpOrderNo,
            status: "ORDER GENERATED",
          });
        } else {
          await db.query(
            `UPDATE sales_requests
             SET status = 'DRAFT'
             WHERE drop_request_id = $1`,
            [dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: "SOHNUM not returned from Sage X3",
          });
        }
      } catch (soapErr) {
        console.error("SOAP ERROR:");
        console.error(soapErr);

        await db.query(
          `UPDATE sales_requests
           SET status = 'DRAFT'
           WHERE drop_request_id = $1`,
          [dropRequestId]
        );

        results.push({
          drop_request_id: dropRequestId,
          success: false,
          error:
            soapErr?.message ||
            "SOAP connection failed",
        });
      }
    } catch (err) {
      await clientDb.query("ROLLBACK");

      console.error("DB ERROR:", err);

      results.push({
        drop_request_id: dropRequestId,
        success: false,
        error: err.message,
      });
    } finally {
      clientDb.release();
    }
  }

  return {
    processed: results.length,
    results,
  };
};


exports.generateOrder_2 = async (user, requestIds) => {
  if (!requestIds || requestIds.length === 0) {
    throw new Error("No request IDs provided");
  }

  const results = [];

  for (const dropRequestId of requestIds) {
    const clientDb = await db.connect();

    try {
      await clientDb.query("BEGIN");

      const header = await clientDb.query(
        "SELECT * FROM sales_requests WHERE drop_request_id = $1",
        [dropRequestId]
      );

      if (header.rows.length === 0) {
        results.push({ drop_request_id: dropRequestId, success: false, error: "Not found" });
        await clientDb.query("ROLLBACK");
        continue;
      }

      const sr = header.rows[0];

      const items = await clientDb.query(
        "SELECT * FROM sales_request_items WHERE drop_request_id = $1 ORDER BY line_no",
        [dropRequestId]
      );

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const dlvDate = sr.request_date
        ? new Date(sr.request_date).toISOString().slice(0, 10).replace(/-/g, "")
        : today;

      // Build LINE XML (same as before)
      const lineItems = items.rows.map((item, idx) => `
<LIN NUM="${idx + 1}">
  <FLD NAME="ITMREF">${item.product_code}</FLD>
  <FLD NAME="QTY">${parseFloat(item.quantity) || 1}</FLD>
  <FLD NAME="GROPRI">${parseFloat(item.price) || 0}</FLD>
  <FLD NAME="SAU">${item.uom || "EA"}</FLD>
</LIN>
`).join("");

      // Build PARAM XML (IMPORTANT - no SOAP envelope here)
      const inputXml = `
<![CDATA[
<PARAM>
  <GRP ID="SOH0_1">
    <FLD NAME="SAESSION">${sr.site || process.env.X3_SALES_SITE || "1100"}</FLD>
    <FLD NAME="SOHTYP">${process.env.X3_ORDER_TYPE || "SOI"}</FLD>
  </GRP>
  <GRP ID="SOH0_2">
    <FLD NAME="BPCORD">${sr.customer_code}</FLD>
    <FLD NAME="ORDDAT">${today}</FLD>
    <FLD NAME="DEESSION">${dlvDate}</FLD>
    <FLD NAME="CUR">${sr.currency || "USD"}</FLD>
    <FLD NAME="BPAADD">${sr.address || ""}</FLD>
    <FLD NAME="PJTH">${sr.reference || ""}</FLD>
  </GRP>
  <TAB ID="SOH1_1" SIZE="${items.rows.length}">
    ${lineItems}
  </TAB>
</PARAM>
]]>
`;

      await clientDb.query(
        "UPDATE sales_requests SET status = 'PROCESSING' WHERE drop_request_id = $1",
        [dropRequestId]
      );

      await clientDb.query("COMMIT");

      // 🔥 SOAP CLIENT CALL (LIKE WORKING PROJECT)
      try {
        const soapClient = await getSoapClient();

        const response = await new Promise((resolve, reject) => {
          soapClient.run(
            {
              callContext: {
                $xml: `
                  <codeLang xsi:type="xsd:string">ENG</codeLang>
                  <poolAlias xsi:type="xsd:string">${process.env.X3_POOL_ALIAS || "TMSNEW"}</poolAlias>
                  <requestConfig xsi:type="xsd:string">adxwss.optreturn=XML</requestConfig>
                `,
                attributes: { "xsi:type": "wss:CAdxCallContext" },
              },
              publicName: {
                attributes: { "xsi:type": "xsd:string" },
                $value: "SOH",
              },
              inputXml: {
                attributes: { "xsi:type": "xsd:string" },
                $xml: inputXml,
              },
            },
            (err, result) => {
              if (err) return reject(err);
              resolve(result);
            }
          );
        });

        const respXml = response?.runReturn?.resultXml?.$value;

        // Extract SOHNUM
        const match = respXml?.match(/SOHNUM[^>]*>([^<]+)</);
        const erpOrderNo = match?.[1]?.trim();

        if (erpOrderNo) {
          await db.query(
            "UPDATE sales_requests SET status = 'ORDER GENERATED', erp_order_no = $1 WHERE drop_request_id = $2",
            [erpOrderNo, dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: true,
            erp_order_no: erpOrderNo,
          });
        } else {
          await db.query(
            "UPDATE sales_requests SET status = 'DRAFT' WHERE drop_request_id = $1",
            [dropRequestId]
          );

          results.push({
            drop_request_id: dropRequestId,
            success: false,
            error: "No SOHNUM returned",
          });
        }

      } catch (soapErr) {
        console.error("SOAP Error:", soapErr.message);

        await db.query(
          "UPDATE sales_requests SET status = 'DRAFT' WHERE drop_request_id = $1",
          [dropRequestId]
        );

        results.push({
          drop_request_id: dropRequestId,
          success: false,
          error: soapErr.message,
        });
      }

    } catch (err) {
      await clientDb.query("ROLLBACK");

      results.push({
        drop_request_id: dropRequestId,
        success: false,
        error: err.message,
      });
    } finally {
      clientDb.release();
    }
  }

  return { processed: results.length, results };
};

