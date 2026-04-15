const db = require("../config/db");
const UserModel  = require("../models/user.model");

function resolveContext(req) {
  //const { user_id, tenant_id, role } = req.user;
   const party_type = req.body?.party_type || req.query?.party_type || 'customer';
    const party_id = req.body?.party_id || req.query?.party_id || req.user?.user_id;


  if (party_type === 'CUSTOMER' || party_type === 'customer') {
    return {
      actor_id: req.user?.user_id,
      actor_type: 'customer',
      party_id: party_id,
      party_type: party_type,
      tenant_id : req.user?.tenant_id
    };
  }
   if (party_type === 'SUPPLIER' || party_type === 'supplier') {
      return {
        actor_id: req.user?.user_id,
        actor_type: 'supplier',
        party_id: party_id,
        party_type: party_type,
        tenant_id : req.user?.tenant_id
      };
    }

  if (party_type === 'salesrep' || party_type === 'SALESREP') {
   // const party_id = req.body?.party_id || req.query?.party_id;
   // const party_type = req.body?.party_type || req.query?.party_type;

    if (!party_id || !party_type) {
      throw new Error('party selection required');
    }

    return {
      actor_id: req.user?.user_id,
      actor_type: 'salesrep',
      party_id,
      party_type,
      tenant_id : req.user?.tenant_id
    };
  }

  throw new Error('Invalid role');
}

exports.clearCart = async (req) => {
  const ctx = resolveContext(req);

  const cart = await db.query(
    `SELECT id FROM cart WHERE actor_id=$1 AND party_id=$2 AND status='ACTIVE'`,
    [ctx.actor_id, ctx.party_id]
  );

  if (!cart.rows.length) return;

  await db.query(`DELETE FROM cart_items WHERE cart_id=$1`, [
    cart.rows[0].id
  ]);

  return { message: 'Cleared' };
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

exports.getCart = async (req) => {
  const context = resolveContext(req);

  const cart = await db.query(
    `SELECT * FROM cart
     WHERE actor_id=$1
       AND actor_type=$2
       AND party_id=$3
       AND party_type=$4
       AND status='ACTIVE'`,
    [
      context.actor_id,
      context.actor_type,
      context.party_id,
      context.party_type
    ]
  );

  if (cart.rows.length === 0) {
    return { items: [] };
  }

  const items = await db.query(
    `SELECT * FROM cart_items WHERE cart_id=$1`,
    [cart.rows[0].id]
  );

  return {
    cart: cart.rows[0],
    items: items.rows
  };
};

 async function getOrCreateCart(client, context) {
   const { actor_id, actor_type, party_id, party_type } = context;

   const existing = await client.query(
     `SELECT * FROM cart
      WHERE actor_id=$1
        AND actor_type=$2
        AND party_id=$3
        AND party_type=$4
        AND status='ACTIVE'
      LIMIT 1`,
     [actor_id, actor_type, party_id, party_type]
   );

   if (existing.rows.length > 0) return existing.rows[0];

   const created = await client.query(
     `INSERT INTO cart (actor_id, actor_type, party_id, party_type, status)
      VALUES ($1,$2,$3,$4,'ACTIVE')
      RETURNING *`,
     [actor_id, actor_type, party_id, party_type]
   );

   return created.rows[0];
 }


exports.addToCart = async (req) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const context = resolveContext(req);
    const cart = await getOrCreateCart(client, context);

    const { product_code, product_name, quantity, uom, price } = req.body;

    await client.query(
      `INSERT INTO cart_items (cart_id, product_code, product_name, quantity, uom, price)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (cart_id, product_code)
       DO UPDATE SET
         quantity = cart_items.quantity + EXCLUDED.quantity,
         updated_at = NOW()`,
      [cart.id, product_code, product_name, quantity, uom, price]
    );

    await client.query('COMMIT');

    return { message: 'Added to cart' };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// 🔹 CHECKOUT
exports.checkout = async (req) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const ctx = resolveContext(req);

    const cart = await client.query(
      `SELECT * FROM cart WHERE actor_id=$1 AND party_id=$2 AND status='ACTIVE'`,
      [ctx.actor_id, ctx.party_id]
    );

    if (!cart.rows.length) throw new Error('Cart empty');

    const items = await client.query(
      `SELECT * FROM cart_items WHERE cart_id=$1`,
      [cart.rows[0].id]
    );

    // 👉 insert into sales_request (mock)


    const order = await client.query(
      `INSERT INTO sales_requests(user_id, tenant_id, customer_code, total_amount, total_qty, status, request_date, created_time)
       VALUES($1, $2, $3, $4, $5, 'Request Created', NOW(), NOW()) RETURNING uuid, drop_request_id`,
      [ctx.actor_id, ctx.tenant_id, ctx.party_id, totalAmount, totalQty]
    );


    for (const item of items.rows) {
      await client.query(
         `INSERT INTO sales_request_items(drop_request_id, line_no, product_code, prod_desc, quantity, price, line_amount, user_id)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
            [order.rows[0].drop_request_id, idx+1, item.product_code, item.product_name, item.quantity, item.price, item.quantity * item.price, ctx.actor_id]
      );
    }

    await client.query(
      `UPDATE cart SET status='CHECKED_OUT' WHERE id=$1`,
      [cart.rows[0].id]
    );

    await client.query('COMMIT');

    return { order_id: order.rows[0].id };

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};