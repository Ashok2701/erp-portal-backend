const db = require("../config/db");

function resolveContext(user, body) {
  let partyId, partyType, erpCustomerCode, erpSupplierCode;

  if (user.role === "CUSTOMER") {
    partyId = user.userId;
    partyType = "CUSTOMER";
    erpCustomerCode = user.erp_customer_code;

  } else if (user.role === "SALESREP") {
    if (!body.customer_id) {
      throw new Error("customer_id is required");
    }

    partyId = body.customer_id;
    partyType = "CUSTOMER";

    // fetch ERP code from mapping table if needed
    erpCustomerCode = body.erp_customer_code || null;

  } else if (user.role === "SUPPLIER") {
    partyId = user.userId;
    partyType = "SUPPLIER";
    erpSupplierCode = user.erp_supplier_code;
  }

  return {
    actorId: user.userId,
    actorType: user.role,
    partyId,
    partyType,
    erpCustomerCode,
    erpSupplierCode
  };
}

exports.clearCart = async (user) => {
  const cart = await db.query(
    `SELECT id FROM cart WHERE actor_id=$1 AND status='ACTIVE'`,
    [user.userId]
  );

  if (cart.rows.length === 0) return;

  await db.query(
    `DELETE FROM cart_items WHERE cart_id=$1`,
    [cart.rows[0].id]
  );
};

exports.deleteItem = async (itemId) => {
  await db.query(`DELETE FROM cart_items WHERE id=$1`, [itemId]);
};

exports.updateItem = async (itemId, body) => {
  await db.query(
    `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
    [body.quantity, itemId]
  );

  return { message: "Updated" };
};


exports.getCart = async (user) => {

  const cartRes = await db.query(
    `SELECT * FROM cart 
     WHERE actor_id=$1 AND status='ACTIVE'`,
    [user.userId]
  );

  if (cartRes.rows.length === 0) {
    return { items: [] };
  }

  const cart = cartRes.rows[0];

  const items = await db.query(
    `SELECT * FROM cart_items WHERE cart_id=$1`,
    [cart.id]
  );

  return {
    cart,
    items: items.rows
  };
};


exports.addToCart = async (user, body) => {

  const ctx = resolveContext(user, body);

  // 1. find or create cart
  let cartRes = await db.query(
    `SELECT * FROM cart 
     WHERE actor_id=$1 AND party_id=$2 AND status='ACTIVE'`,
    [ctx.actorId, ctx.partyId]
  );

  let cart;

  if (cartRes.rows.length === 0) {
    const insert = await db.query(
      `INSERT INTO cart 
       (actor_type, actor_id, party_type, party_id, erp_customer_code, erp_supplier_code)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        ctx.actorType,
        ctx.actorId,
        ctx.partyType,
        ctx.partyId,
        ctx.erpCustomerCode,
        ctx.erpSupplierCode
      ]
    );

    cart = insert.rows[0];
  } else {
    cart = cartRes.rows[0];
  }

  // 2. check existing item
  const item = await db.query(
    `SELECT * FROM cart_items WHERE cart_id=$1 AND product_code=$2`,
    [cart.id, body.product_code]
  );

  if (item.rows.length > 0) {
    await db.query(
      `UPDATE cart_items 
       SET quantity = quantity + $1 
       WHERE id=$2`,
      [body.quantity, item.rows[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO cart_items 
       (cart_id, product_code, product_name, quantity, uom)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        cart.id,
        body.product_code,
        body.product_name,
        body.quantity,
        body.uom
      ]
    );
  }

  return { message: "Item added to cart" };
};