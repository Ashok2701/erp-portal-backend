const { getErpDbPool } = require("../erpDbManager");

/* Customers */
exports.getCustomers = async (conn) => {
  const pool = getErpDbPool(conn);
  const result = await pool.query(`
    SELECT
      BPCNUM_0 AS customer_code,
      BPCNAM_0 AS customer_name,
      CRN AS currency
    FROM TMSNEW.BPCUSTOMER

  `);
  return result.rows;
};

/* Suppliers */
exports.getSuppliers = async (conn) => {
  const pool = getErpDbPool(conn);
  const result = await pool.query(`
    SELECT
      BPSNUM_0 AS supplier_code,
      BPSNAM_0 AS supplier_name
    FROM TMSNEW.BPSUPPLIER
    WHERE BPSSTA = 2
  `);
  return result.rows;
};

/* Products */
exports.getProducts = async (conn) => {
  const pool = getErpDbPool(conn);
  const result = await pool.query(`
    SELECT
      ITMREF_0 AS product_code,
      ITMDES_0 AS product_name,
      STU AS uom
    FROM TMSNEW.ITMMASTER
    WHERE ITMSTA = 1
  `);
  return result.rows;
};

/* Customer Addresses */
exports.getCustomerAddresses = async (conn, customerCode) => {
  const pool = getErpDbPool(conn);
  const result = await pool.query(
    `
    SELECT
      ADRNUM AS address_code,
      ADRNAM AS address_name,
      CTY AS city,
      POSCOD AS postal_code,
      CRY AS country
    FROM TMSNEW.BPADDRESS
    WHERE BPACOD = $1
    `,
    [customerCode]
  );
  return result.rows;
};

/* Dashboard */
exports.getDashboardData = async (conn, erpEntityCode) => {
  const pool = getErpDbPool(conn);

  const orders = await pool.query(
    `SELECT COUNT(*) FROM TMSNEW.SORDER WHERE BPCORD = $1`,
    [erpEntityCode]
  );

  const invoices = await pool.query(
    `SELECT COUNT(*) FROM TMSNEW.SINVOICE WHERE BPCINV = $1 AND PAYSTA <> 'PAID'`,
    [erpEntityCode]
  );

  return {
    total_orders: Number(orders.rows[0].count),
    open_invoices: Number(invoices.rows[0].count)
  };
};