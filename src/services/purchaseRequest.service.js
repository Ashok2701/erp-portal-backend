"use strict";
const db           = require("../config/db");
const emailService = require("./email.service");
const soap         = require("soap");
const https        = require("https");
const TenantSettings = require("../models/tenantSettings.model");

// ── Sequence number ───────────────────────────────────────────
async function generatePRNumber(client) {
  const r = await client.query(
    `SELECT nextval('purchase_request_seq') AS num`
  );
  return `PREQ${String(r.rows[0].num).padStart(8, "0")}`;
}

// ── CREATE ────────────────────────────────────────────────────
exports.create = async (user, body) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const prId = await generatePRNumber(client);

    let totalAmount = 0;
    let totalQty    = 0;
    (body.items || []).forEach(item => {
      totalAmount += (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
      totalQty    += parseFloat(item.quantity) || 0;
    });

    await client.query(
      `INSERT INTO purchase_requests
         (purchase_request_id, tenant_id, user_id, supplier_code, site,
          currency, reference, comment, total_amount, total_qty,
          status, request_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11)`,
      [prId, user.tenant_id, user.user_id,
       user.erp_entity_code || user.erp_supplier_code,
       body.site, body.currency || "USD", body.reference,
       body.comment, totalAmount, totalQty,
       body.request_date || new Date().toISOString().split("T")[0]]
    );

    let lineNo = 1;
    for (const item of (body.items || [])) {
      await client.query(
        `INSERT INTO purchase_request_items
           (purchase_request_id, line_no, product_code, prod_desc,
            quantity, unit, price, line_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [prId, lineNo++, item.product_code, item.prod_desc,
         item.quantity, item.unit || "UN",
         parseFloat(item.price) || 0,
         (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0)]
      );
    }

    await client.query("COMMIT");
    return { purchase_request_id: prId, message: "Purchase Request Created" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ── GET ALL ───────────────────────────────────────────────────
exports.getAll = async (user) => {
  const isAdmin = user.role === "admin" || user.role === "Administrator";
  let query, params;

  if (isAdmin) {
    query  = `SELECT pr.*, u.username, u.full_name
              FROM purchase_requests pr
              LEFT JOIN users u ON u.user_id = pr.user_id
              WHERE pr.tenant_id = $1
              ORDER BY pr.created_at DESC`;
    params = [user.tenant_id];
  } else {
    // Filter by the supplier entity (erp_entity_code / erp_supplier_code),
    // not by whichever individual user_id happened to submit each request —
    // a supplier can have more than one login (e.g. different staff), and
    // they should all see the same shared list of requests raised for
    // their supplier entity, same as Purchase Orders already do. Fall back
    // to user_id only if no supplier code is resolvable yet (ERP mapping
    // not configured), so nothing silently returns zero rows.
    const supplierCode = user.erp_entity_code || user.erp_supplier_code || null;
    if (supplierCode) {
      query  = `SELECT pr.*, u.username, u.full_name
                FROM purchase_requests pr
                LEFT JOIN users u ON u.user_id = pr.user_id
                WHERE pr.supplier_code = $1 AND pr.tenant_id = $2
                ORDER BY pr.created_at DESC`;
      params = [supplierCode, user.tenant_id];
    } else {
      query  = `SELECT * FROM purchase_requests
                WHERE user_id = $1 AND tenant_id = $2
                ORDER BY created_at DESC`;
      params = [user.user_id, user.tenant_id];
    }
  }

  const r = await db.query(query, params);
  return r.rows;
};

// ── GET BY ID ─────────────────────────────────────────────────
exports.getById = async (id, user) => {
  const pr = await db.query(
    `SELECT pr.*, u.username, u.full_name
     FROM purchase_requests pr
     LEFT JOIN users u ON u.user_id = pr.user_id
     WHERE pr.purchase_request_id = $1 AND pr.tenant_id = $2`,
    [id, user.tenant_id]
  );
  if (!pr.rows.length) return null;

  const items = await db.query(
    `SELECT * FROM purchase_request_items
     WHERE purchase_request_id = $1 ORDER BY line_no`,
    [id]
  );

  return { ...pr.rows[0], items: items.rows };
};

// ── UPDATE STATUS (Admin approve/reject) ──────────────────────
exports.updateStatus = async (id, tenantId, status) => {
  await db.query(
    `UPDATE purchase_requests SET status=$1 WHERE purchase_request_id=$2 AND tenant_id=$3`,
    [status, id, tenantId]
  );
};

// ── CONVERT TO PO (Admin → Sage X3 via SOAP) ─────────────────
exports.convertToPO = async (user, requestIds) => {
  const settings = await TenantSettings.getTenantSettings(user.tenant_id);

  if (!settings?.x3_wsdl_url)
    throw Object.assign(new Error("X3 SOAP not configured for this tenant"), { code: "ERP_NOT_CONFIGURED" });

  // Create SOAP client
  const soapClient = await soap.createClientAsync(settings.x3_wsdl_url, {
    attributesKey: "attributes",
    valueKey:      "$value",
    xmlKey:        "$xml",
    wsdl_options:  { httpsAgent: new https.Agent({ rejectUnauthorized: false }) },
  });

  soapClient.setSecurity(
    new soap.BasicAuthSecurity(settings.x3_username, settings.x3_password, "")
  );
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const callContext = `
<codeLang xsi:type="xsd:string">ENG</codeLang>
<poolAlias xsi:type="xsd:string">${settings.x3_pool_alias}</poolAlias>
<poolId xsi:type="xsd:string">${settings.x3_pool_alias}</poolId>
<requestConfig xsi:type="xsd:string">adxwss.optreturn=XML</requestConfig>`;

  const results = [];

  for (const prId of requestIds) {
    const pr = await exports.getById(prId, user);
    if (!pr) { results.push({ id: prId, success: false, error: "Not found" }); continue; }
    if (!pr.items?.length) { results.push({ id: prId, success: false, error: "No items" }); continue; }

    const fmt = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,"0")}${String(dt.getDate()).padStart(2,"0")}`;
    };

    const orderDate = fmt(pr.request_date || new Date());

    // Field mapping per X10CPOHCRE's actual contract (confirmed from the
    // web service's Mapping tab — GRP1 = header, GRP2 = line list, GRP3 =
    // output). No price field in GRP2 — X3 resolves pricing itself from
    // the item/supplier price list, it isn't passed in.
    let linesXml = "";
    pr.items.forEach((item, idx) => {
      linesXml += `
<LIN NUM="${idx + 1}">
<FLD NAME="I_XITMREF" TYPE="Char">${item.product_code}</FLD>
<FLD NAME="I_QTYUOM" TYPE="Decimal">${parseFloat(item.quantity) || 1}</FLD>
<FLD NAME="I_XUOM" TYPE="Char">${item.unit || "UN"}</FLD>
</LIN>`;
    });

    const value = `
<![CDATA[<PARAM>
<GRP ID="GRP1">
<FLD NAME="I_XPOHFCY" TYPE="Char">${pr.site || settings.x3_sales_site}</FLD>
<FLD NAME="I_XORDDAT" TYPE="Date">${orderDate}</FLD>
<FLD NAME="I_XBPSNUM" TYPE="Char">${pr.supplier_code}</FLD>
</GRP>
<TAB ID="GRP2" DIM="500" SIZE="${pr.items.length}">
${linesXml}
</TAB>
</PARAM>
]]>`;

    try {
      // Same call pattern as generateOrder() (sales order creation) in
      // salesRequest.service.js — callContext/publicName/inputXml wrapped
      // with explicit xsi:type attributes via client.run(), not the plain
      // object shape runAsync() was using before. Web service name per
      // instruction: X10CPOHCRE (was "ZPURCHASEORDER", which doesn't
      // appear to be a real X3 web service name — likely why this was
      // never actually verified working).
      const response = await new Promise((resolve, reject) => {
        soapClient.run(
          {
            callContext: {
              $xml: callContext,
              attributes: { "xsi:type": "wss:CAdxCallContext" },
            },
            publicName: {
              attributes: { "xsi:type": "xsd:string" },
              $value: "X10CPOHCRE",
            },
            inputXml: {
              attributes: { "xsi:type": "xsd:string" },
              $xml: value,
            },
          },
          (error, resp) => {
            if (error) return reject(error);
            resolve(resp);
          }
        );
      });

      console.log("=================================");
      console.log("PO SOAP RESPONSE (X10CPOHCRE)");
      console.log("=================================");
      console.log(JSON.stringify(response, null, 2));

      const resultData = response?.runReturn?.resultXml?.$value?.RESULT;
      const responseGroups = resultData?.GRP || [];

      // Flatten every group's fields — same reasoning as generateOrder():
      // we don't have confirmed documentation for exactly which GRP/field
      // X10CPOHCRE returns the new PO number and status under, so capture
      // everything rather than guess a single field name and silently fail.
      const allFields = {};
      responseGroups.forEach((g) => {
        if (g?.FLD?.length > 0) {
          g.FLD.forEach((f) => { allFields[f.attributes.NAME] = f.$value || ""; });
        }
      });

      // GRP3 output fields, per the confirmed mapping.
      const poNumber      = allFields.O_XPOHNUM || null;
      const status        = allFields.O_XSTATUS;
      const message1       = allFields.O_XMESSAGE1 || "";
      const message2       = allFields.O_XMESSAGE2 || "";
      const statusMessage = [message1, message2].filter(Boolean).join(" — ");

      if (poNumber) {
        await db.query(
          `UPDATE purchase_requests SET status='CONVERTED', erp_po_number=$1
           WHERE purchase_request_id=$2`,
          [poNumber, prId]
        );
        results.push({ id: prId, success: true, po_number: poNumber, status, message: statusMessage });
      } else {
        results.push({
          id: prId,
          success: false,
          error: statusMessage || "PO number not returned from X3",
          status,
          erp_response_fields: allFields,
        });
      }
    } catch (soapErr) {
      results.push({ id: prId, success: false, error: soapErr.message });
    }
  }

  return results;
};
