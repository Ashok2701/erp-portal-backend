const { getErpDbPool } = require("../erpDbManager");

/* Customers */
exports.getCustomers = async (conn) => {
  const pool = await getErpDbPool(conn);

  const result = await pool.request().query(`
    SELECT
      BPCNUM_0 AS customer_code,
      BPCNAM_0 AS customer_name,
      CUR_0 AS currency
    FROM TMSNEW.BPCUSTOMER

  `);

  return result.recordset;
};

/* Suppliers */
exports.getSuppliers = async (conn) => {
  const pool = await getErpDbPool(conn);

  const result = await pool.request().query(`
    SELECT
      BPSNUM_0 AS supplier_code,
      BPSNAM_0 AS supplier_name
    FROM TMSNEW.BPSUPPLIER

  `);

  return result.recordset;
};

/* Products */
exports.getProducts = async (conn) => {
  const pool = await getErpDbPool(conn);

  const result = await pool.request().query(`
    SELECT
      ITMREF_0 AS product_code,
      ITMDES_0 AS product_name,
      STU AS uom
    FROM TMSNEW.ITMMASTER

  `);

  return result.recordset;
};

/* Customer Addresses */
exports.getCustomerAddresses = async (conn, customerCode) => {
  const pool = await getErpDbPool(conn);

  const request = pool.request();
  request.input("customerCode", customerCode);

  const result = await request.query(`
    SELECT
      BPAADD_0 AS address_code,
      BPAADDLIG_0 AS address_name,
      CTY_0 AS city,
      POSCOD_0 AS postal_code,
      CRY_0 AS country
    FROM TMSNEW.BPADDRESS
    WHERE BPANUM_0 = @customerCode
  `);

  return result.recordset;
};