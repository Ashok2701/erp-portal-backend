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
    }, user?.tenant_id).catch(() => {});

    emailService.sendSalesRequestAdminAlert({
      drop_request_id: dropRequestId,
      customer_code: body.customer_code,
      items: body.items,
      total_amount: totalAmount,
      address: body.address,
    }, user?.tenant_id).catch(() => {});
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


exports.patchStatus = async (dropRequestId, body) => {
  // Lightweight status-only patch — used by admin to update status/ERP numbers
  const fields = [];
  const values = [];
  let i = 1;

  if (body.status !== undefined)        { fields.push(`status=$${i++}`);           values.push(body.status); }
  if (body.erp_order_no !== undefined)  { fields.push(`erp_order_no=$${i++}`);     values.push(body.erp_order_no || null); }
  if (body.erp_delivery_no !== undefined){ fields.push(`erp_delivery_no=$${i++}`); values.push(body.erp_delivery_no || null); }

  if (fields.length === 0) return;

  values.push(dropRequestId);
  await db.query(
    `UPDATE sales_requests SET ${fields.join(', ')} WHERE drop_request_id=$${i}`,
    values
  );
};

exports.update = async (dropRequestId, body) => {

  const client = await db.connect();

  try {

    await client.query("BEGIN");

    let totalAmount = 0;
    let totalQty = 0;

    // calculate totals
    body.items.forEach(item => {
      const amt = Number(item.price) * Number(item.quantity);
      totalAmount += amt;
      totalQty += Number(item.quantity);
    });

    // update sales request header
    await client.query(
      `UPDATE sales_requests
       SET comment=$1,
           address=$2,
           reference=$3,
           currency=$4,
           request_date=$5::timestamp,
           total_amount=$6,
           total_qty=$7,
           status=$8
       WHERE drop_request_id=$9`,
      [
        body.comment,
        body.address,
        body.reference,
        body.currency,
        body.request_date,
        totalAmount,
        totalQty,
        body.status,
        dropRequestId
      ]
    );

    // remove old items
    await client.query(
      `DELETE FROM sales_request_items
       WHERE drop_request_id=$1`,
      [dropRequestId]
    );

    // insert updated items
    let lineNo = 1;

    for (const item of body.items) {

      const lineAmount =
        Number(item.price) * Number(item.quantity);

      await client.query(
        `INSERT INTO sales_request_items
         (drop_request_id,
          line_no,
          product_code,
          prod_desc,
          quantity,
          price,
          line_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          dropRequestId,
          lineNo++,
          item.product_code,
          item.prod_desc,
          item.quantity,
          item.price,
          lineAmount
        ]
      );
    }

    await client.query("COMMIT");

    return {
      message: "Sales Request Updated"
    };

  } catch (err) {

    await client.query("ROLLBACK");
    throw err;

  } finally {

    client.release();

  }
};


exports.update_old = async (dropRequestId, body) => {

  await db.query(
    `UPDATE sales_requests
     SET comment=$1,
         address=$2,
         reference=$3,
         currency=$4,
         request_date=$5::timestamp
     WHERE drop_request_id=$6`,
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

exports.generateOrder = async (user, requestIds) => {
  // Load tenant settings for SOAP config
  let settings = null;
  try {
    const TenantSettings = require("../models/tenantSettings.model");
    settings = await TenantSettings.getTenantSettings(user.tenant_id);
  } catch(e) { console.warn("Could not load tenant settings, falling back to env:", e.message); }

  try {
    if (!requestIds || requestIds.length === 0) {
      throw new Error("No request IDs provided");
    }

    const results = [];

    // ============================================
    // CALL CONTEXT
    // ============================================

    const callContext = `
<codeLang xsi:type="xsd:string">ENG</codeLang>
<poolAlias xsi:type="xsd:string">${settings?.x3_pool_alias || process.env.X3_POOL_ALIAS}</poolAlias>
<poolId xsi:type="xsd:string">${settings?.x3_pool_alias || process.env.X3_POOL_ALIAS}</poolId>
<requestConfig xsi:type="xsd:string">adxwss.optreturn=XML</requestConfig>
`;

    // ============================================
    // CREATE SOAP CLIENT
    // ============================================

    // Resolve WSDL URL — clear cache to pick up DB changes
    const TenantSettingsModel = require("../models/tenantSettings.model");
    TenantSettingsModel.clearCache(user.tenant_id);
    const freshSettings = await TenantSettingsModel.getTenantSettings(user.tenant_id);
    
    const wsdlUrl = freshSettings?.x3_wsdl_url || settings?.x3_wsdl_url || process.env.X3_WSDL_URL;
    
    if (!wsdlUrl) {
      throw new Error("WSDL URL not configured. Please set x3_wsdl_url in tenant settings.");
    }

    // Force HTTP if URL uses HTTPS — X3 classic web services often run on plain HTTP
    const effectiveUrl = wsdlUrl.replace(/^https:\/\//, 'http://');
    console.log("[SOAP] WSDL URL:", effectiveUrl);
    console.log("[SOAP] Pool alias:", freshSettings?.x3_pool_alias || settings?.x3_pool_alias);

    const client = await soap.createClientAsync(
      effectiveUrl,
      {
        attributesKey: "attributes",
        valueKey: "$value",
        xmlKey: "$xml",
        wsdl_options: {
          httpClient: { timeout: 30000 },
        },
        endpoint: effectiveUrl.replace('?wsdl', ''),
      }
    );

    // ============================================
    // BASIC AUTH
    // ============================================

    client.setSecurity(
      new soap.BasicAuthSecurity(
        settings?.x3_username || process.env.X3_USERNAME,
        settings?.x3_password || process.env.X3_PASSWORD,
        ""
      )
    );

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // ============================================
    // PROCESS REQUESTS
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
        // DATE FORMAT YYYYMMDD
        // ============================================

        const formatDate = (date) => {
          const d = new Date(date);

          return (
            d.getFullYear() +
            String(d.getMonth() + 1).padStart(2, "0") +
            String(d.getDate()).padStart(2, "0")
          );
        };

        const orderDate = formatDate(
          sr.request_date || new Date()
        );

        const deliveryDate = sr.delivery_date
          ? formatDate(sr.delivery_date)
          : orderDate;

        // ============================================
        // BUILD LINE XML
        // ============================================

        let product = "";

        items.rows.map((item, index) => {
          product =
            product +           `
<LIN NUM="${index + 1}">
<FLD NAME="I_XITMREF" TYPE="Char">${item.product_code}</FLD>
<FLD NAME="I_XQTY" TYPE="Decimal">${parseFloat(item.quantity) || 1}</FLD>
<FLD NAME="I_XUOM" TYPE="Char">${item.uom || "UN"}</FLD>
<FLD NAME="I_XGROPRI" TYPE="Decimal">${parseFloat(item.price) || 0}</FLD>
</LIN>`;
        });

        // ============================================
        // XML VALUE
        // ============================================

        const value = `
<![CDATA[<PARAM>
<GRP ID="GRP1">
<FLD NAME="I_XFLAG" TYPE="Integer">0</FLD>
<FLD NAME="I_XFLG" TYPE="Integer">0</FLD>
<FLD NAME="I_XVCRNUM" TYPE="Char"></FLD>
<FLD NAME="I_XFCY" TYPE="Char">${sr.site || settings?.x3_sales_site || process.env.X3_SALES_SITE}</FLD>
<FLD NAME="I_XBPCNUM" TYPE="Char">${sr.customer_code}</FLD>
<FLD NAME="I_XADR" TYPE="Char">${sr.address || "10"}</FLD>
<FLD NAME="I_XORDDAT" TYPE="Date">${orderDate}</FLD>
<FLD NAME="I_XDLVDAT" TYPE="Date">${deliveryDate}</FLD>
<FLD NAME="I_XSHIDAT" TYPE="Date">${deliveryDate}</FLD>
<FLD NAME="I_XUSERID" TYPE="Char">${user?.username || "ADMIN"}</FLD>
<FLD NAME="I_XMDL" TYPE="Char"></FLD>
<FLD NAME="I_XCOMMENTS" TYPE="Char">${sr.comments || "SOAP TEST ORDER"}</FLD>
<FLD NAME="I_XPONUM" TYPE="Char">${sr.po_number || ""}</FLD>
<FLD NAME="I_XORDTYP" TYPE="Char">${sr.order_type || settings?.x3_order_type || process.env.X3_ORDER_TYPE}</FLD>
<FLD NAME="I_XUNIQUENO" TYPE="Char">${dropRequestId}</FLD>
</GRP>
<TAB ID="GRP2" DIM="500" SIZE="${items.rows.length}">
${product}
</TAB>

</PARAM>
]]>`;

        console.log("=================================");
        console.log("INPUT XML");
        console.log("=================================");
        console.log(value);

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
        // SOAP CALL
        // ============================================

        const response = await new Promise(
          (resolve, reject) => {
            client.run(
              {
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

                  $xml: value,
                },
              },

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
        console.log(JSON.stringify(response, null, 2));

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
        // SOAP ERRORS
        // ============================================

        // ============================================
        // EXTRACT RESPONSE GROUP
        // ============================================

        const resultData =
          response?.runReturn?.resultXml?.$value?.RESULT;

        const responseGroups = resultData?.GRP || [];

        // FIND GRP3
        const grp3 = responseGroups.find(
          (g) => g.attributes?.ID === "GRP3"
        );

        // CONVERT FLDS
        let grp3Fields = {};

        if (grp3?.FLD?.length > 0) {
          grp3.FLD.forEach((f) => {
            grp3Fields[f.attributes.NAME] =
              f.$value || "";
          });
        }

        // RESPONSE VALUES
        const statusFlag = grp3Fields.O_XSFLG;
        const statusMessage = grp3Fields.O_XSMESS;
        const erpOrderNo = grp3Fields.O_XSOHNUM;

        // ============================================
        // SUCCESS
        // ============================================

        if (statusFlag === "2" && erpOrderNo) {

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
            message: statusMessage,
          });

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
            error: statusMessage || "Order creation failed",
          });
        }
      }
      catch (err) {
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

