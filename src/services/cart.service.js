const db = require("../config/");
const UserModel  = require("../models/user.model");

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
  const client = await db.connect();
 
   console.log("user details", user);

    const getuserinfo = await UserModel.getUserById(user.user_id);
    const getUserdata = getuserinfo[0];

    if(getUserdata.erp_entity_type === 'supplier') {
      body.erp_supplier_code  =  getUserdata.erp_entity_code
    }
    else if(getUserdata.erp_entity_type === 'customer') {
     body.erp_customer_code =  getUserdata.erp_entity_code
    }

   console.log("user details body", body);

      console.log("user details getuserinfo", getuserinfo);
   
   console.log("user details getUserdata", getUserdata);
      
  try {
    await client.query("BEGIN");

    // 🔥 1. Find existing cart
    let cartRes = await client.query(
      `SELECT * FROM cart 
       WHERE actor_id=$1 AND actor_type=$2 AND status='ACTIVE'`,
      [user.id, user.role]
    );

    let cart;

    if (cartRes.rows.length === 0) {
      // 🔥 Create new cart
      const newCart = await client.query(
        `INSERT INTO cart 
        (actor_id, actor_type, party_type, party_id, erp_customer_code, erp_supplier_code, status)
        VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE')
        RETURNING *`,
        [
          getUserdata.user_id,
          getUserdata.erp_entity_type,
          body.party_type || getUserdata.erp_entity_type,
          body.party_id || getUserdata.user_id,
          body.erp_customer_code || null,
          body.erp_supplier_code  ||  null
        ]
      );

      cart = newCart.rows[0];
    } else {
      cart = cartRes.rows[0];
    }

    // 🔥 2. Check if item exists
    const itemRes = await client.query(
      `SELECT * FROM cart_items 
       WHERE cart_id=$1 AND product_code=$2`,
      [cart.id, body.product_code]
    );

    if (itemRes.rows.length > 0) {
      // 🔁 Update qty
      await client.query(
        `UPDATE cart_items
         SET quantity = quantity + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [body.quantity, itemRes.rows[0].id]
      );
    } else {
      // ➕ Insert new item
      await client.query(
        `INSERT INTO cart_items
        (cart_id, product_code, product_name, quantity, uom, price)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          cart.id,
          body.product_code,
          body.product_name,
          body.quantity,
          body.uom,
          body.price
        ]
      );
    }

    await client.query("COMMIT");

    return { message: "Added to cart" };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};