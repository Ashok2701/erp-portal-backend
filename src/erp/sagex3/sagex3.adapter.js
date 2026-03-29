const BaseERPAdapter = require("../base.adapter");
const UserModel  = require("../../models/user.model");

class SageX3Adapter extends BaseERPAdapter {
    

 async getCustomers(){

      return this.getCustomersFromDB();
 }

 async getSuppliers(){

      return this.getSuppliersFromDB();
 }

 async getCustomerAddresses(customerCode) {
   return this.getCustomerAddressesFromDB(customerCode);
 }

 async getSupplierAddresses(supplierCode) {
   return this.getSupplierAddressesFromDB(supplierCode);
 }

 async getStock(filters) {
  return this.getStockFromDb(filters);
}


 async getProducts(filters = {}) {
    
  const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

   const pool = await sql.connect(config);
  
  let query = `
    SELECT I.ITMREF_0 AS PROD_CODE,I.TCLCOD_0 AS CATEGORY, I.ITMDES1_0 AS PROD_DESC, C.BLOB_0 AS PROD_IMG, I.STU_0 AS UOM
FROM 
TMSNEW.ITMMASTER I
LEFT JOIN TMSNEW.CBLOB C ON I.ITMREF_0 = C.IDENT1_0 AND C.CODBLB_0 = 'ITM'
    `;

   
  const request = pool.request();

  if (filters.category) {
    query += " WHERE I.TCLCOD_0 = @category";
    request.input("category", sql.VarChar, filters.category);
  }

  const result = await request.query(query);

  return result.recordset;


 //  return result.recordset;

  }

  async getProductCategories() {
    
    const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

   const pool = await sql.connect(config);
    
  
   const result = await pool.request().query(`
      SELECT TCLCOD_0 AS Category_Code, TCLDES_0 AS Category_Desc FROM TMSNEW.ITMCATEG
   `);

   return result.recordset;
    
  }

 async getSuppliersFromDB(){

   const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

   const pool = await sql.connect(config);

   const result = await pool.request().query(`
      SELECT
      BPSNAM_0 AS supplierCode,
	  BPSNAM_0 as supplierName
     FROM TMSNEW.BPSUPPLIER
   `);

   return result.recordset;

 }



 async getCustomersFromDB(){

   const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

   const pool = await sql.connect(config);

   const result = await pool.request().query(`
     SELECT
       BPCNUM_0 AS customer_code,
       BPCNAM_0 AS customer_name
     FROM TMSNEW.BPCUSTOMER
   `);

   return result.recordset;

 }


async getCustomerAddressesFromDB(customerCode) {

  const sql = require("mssql");

    const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };


  const pool = await sql.connect(config);

  const query = `
    SELECT
      ADRNUM_0 AS address_code,
      ADRNAM_0 AS address_name,
      ADD1_0 AS address_line1,
      CTY_0 AS city,
      CRY_0 AS country
    FROM TMSNEW.BPADDRESS
    WHERE BPACOD_0 = @customerCode
  `;

  const request = pool.request();
  request.input("customerCode", sql.VarChar, customerCode);

  const result = await request.query(query);

  return result.recordset;
}


async getSupplierAddressesFromDB(supplierCode) {

  const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

  const pool = await sql.connect(config);

  const query = `
    SELECT 
      ADRNUM_0 AS address_code,
      ADRNAM_0 AS address_name,
      ADD1_0 AS address_line1,
      CTY_0 AS city,
      CRY_0 AS country
    FROM TMSNEW.BPADDRESS
    WHERE BPSNUM_0 = @supplierCode
  `;

  const request = pool.request();
  request.input("supplierCode", sql.VarChar, supplierCode);

  const result = await request.query(query);

  return result.recordset;
}



// SALES QUOTE
async getAllQuotes(user) {

  const sql = require("mssql");

     const config = {
       user: process.env.ERP_DB_USER,
       password: process.env.ERP_DB_PASSWORD,
       server: process.env.ERP_DB_HOST,
       database: process.env.ERP_DB_NAME,
       port: parseInt(process.env.ERP_DB_PORT),
        options: {
      encrypt: false, // or true depending on your setup
      trustServerCertificate: true,
    },
     };
  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("x3user", sql.NVarChar, user.erp_customer_code)
    .input("site", sql.NVarChar, user.site)
    .query(`
      SELECT A.SQHNUM_0, A.SQHTYP_0, A.QUOINVATI_0, D.TEXTE_0, A.QUODAT_0,
             A.CUSQUOREF_0, A.QUOSTA_0, A.FFWNUM_0, B.BPTNAM_0,
             A.VLYDAT_0, A.SOHNUM_0, A.ORDDAT_0, A.CUR_0
      FROM tbs.TMSNEW.SQUOTE A
      LEFT JOIN tbs.TMSNEW.BPCARRIER B ON A.FFWNUM_0 = B.BPTNUM_0
      LEFT JOIN tbs.TMSNEW.ATEXTRA D
        ON A.SQHTYP_0 = D.IDENT1_0
       AND D.CODFIC_0 = 'TABSQHTYP'
      WHERE  A.BPCORD_0=@x3user
      ORDER BY A.QUODAT_0 DESC
    `);

  for (const row of result.recordset) {
    const items = await pool.request()
      .input("site", sql.NVarChar, user.site)
      .input("quoteNo", sql.NVarChar, row.SQHNUM_0)
      .query(`
        SELECT ITMREF_0, ITMDES1_0, QTY_0, SAU_0, NETPRIATI_0
        FROM tbs.TMSNEW.SQUOTED
        WHERE  SQHNUM_0=@quoteNo
      `);

    row.items = items.recordset;
  }

  return result.recordset;
}

async getQuoteDetail(id, user) {

  const sql = require("mssql");

  const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };


  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("orderNo", sql.NVarChar, id)
    .query(`
      SELECT *
      FROM tbs.TMSNEW.SQUOTE
      WHERE SQHNUM_0=@orderNo
    `);

  if (!result.recordset.length) return [];

  const header = result.recordset[0];

  const items = await pool.request()
    .input("quoteNo", sql.NVarChar, id)
    .query(`
      SELECT ITMREF_0, ITMDES1_0, QTY_0, NETPRIATI_0
      FROM tbs.TMSNEW.SQUOTED
      WHERE SQHNUM_0=@quoteNo
    `);

  return {
    header,
    items: items.recordset
  };
}


async getAllOrders(user) {

  const sql = require("mssql");

  const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };


  const pool = await sql.connect(config);

    const { tenant_id } = user;
   
       // check duplicate
  const getuserinfo = await UserModel.getUserById(user.user_id);

    console.log("User details", user)
     console.log("User details", getuserinfo)
     console.log("User details", getuserinfo[0].erp_entity_code)
  const result = await pool.request()
    .input("x3user", sql.NVarChar, getuserinfo[0].erp_entity_code)
    .query(`
      SELECT A.SALFCY_0, A.ORDINVATI_0, A.CUR_0,
             A.CUSORDREF_0, A.BPCORD_0, A.BPCNAM_0,
             A.SOHNUM_0, A.SOHTYP_0, A.ORDDAT_0,
             A.SHIDAT_0, A.ALLSTA_0, A.INVSTA_0,
             C.BPTNAM_0
      FROM tbs.TMSNEW.SORDER A
      LEFT JOIN tbs.TMSNEW.BPCARRIER C ON A.BPTNUM_0 = C.BPTNUM_0
      WHERE  A.BPCORD_0=@x3user
      ORDER BY A.ORDDAT_0 DESC
    `);

  for (const row of result.recordset) {

    const items = await pool.request()
      .input("site", sql.NVarChar, user.site)
      .input("orderNo", sql.NVarChar, row.SOHNUM_0)
      .query(`
        SELECT A.ITMREF_0, C.ITMDES_0,
               A.QTY_0, C.NETPRIATI_0,
               (A.QTY_0 * C.GROPRI_0) AS total_amount
        FROM tbs.TMSNEW.SORDERQ A
        LEFT JOIN tbs.TMSNEW.SORDERP C
          ON A.SOHNUM_0 = C.SOHNUM_0
        WHERE  A.SOHNUM_0=@orderNo
      `);

    row.items = items.recordset;
  }

  return result.recordset;
}


async getOrderDetail(id, user) {

  const sql = require("mssql");

  const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };


  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("orderNo", sql.NVarChar, id)
    .query(`
      SELECT *
      FROM tbs.TMSNEW.SORDER
      WHERE SOHNUM_0=@orderNo
    `);

  if (!result.recordset.length) return [];

  const header = result.recordset[0];

  const items = await pool.request()
    .input("site", sql.NVarChar, header.SALFCY_0)
    .input("orderNo", sql.NVarChar, id)
    .query(`
      SELECT A.ITMREF_0, C.ITMDES_0,
             A.QTY_0, A.DLVQTY_0,
             C.NETPRIATI_0
      FROM tbs.TMSNEW.SORDERQ A
      LEFT JOIN tbs.TMSNEW.SORDERP C
        ON A.SOHNUM_0 = C.SOHNUM_0
      WHERE  A.SOHNUM_0=@orderNo
    `);

  return {
    header,
    items: items.recordset
  };
}

async getAllInvoices(user) {

  const sql = require("mssql");

  const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };


  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("x3user", sql.NVarChar, user.erp_customer_code)
    .input("site", sql.NVarChar, user.site)
    .query(`
      SELECT A.NUM_0, A.SIVTYP_0, A.BPR_0,
             A.INVDAT_0, A.CUR_0,
             A.AMTATI_0, A.AMTNOT_0,
             A.INVSTA_0, A.FCY_0
      FROM tbs.TMSNEW.SINVOICE A
      WHERE  A.BPR_0=@x3user
      ORDER BY A.INVDAT_0 DESC
    `);

  return result.recordset;
}


async getInvoiceDetail(id, user) {

  const sql = require("mssql");
  const pool = await sql.connect(this.config);

  const headerRes = await pool.request()
    .input("invoiceNo", sql.NVarChar, id)
    .query(`
      SELECT *
      FROM tbs.TMSNEW.SINVOICE
      WHERE NUM_0=@invoiceNo
    `);

  if (!headerRes.recordset.length) return [];

  const header = headerRes.recordset[0];

  const itemsRes = await pool.request()
    .input("invoiceNo", sql.NVarChar, id)
    .query(`
      SELECT ITMREF_0, ITMDES1_0,
             QTY_0, NETPRIATI_0
      FROM tbs.TMSNEW.SINVOICED
      WHERE NUM_0=@invoiceNo
    `);

  return {
    header,
    items: itemsRes.recordset
  };
}

async getPendingInvoices(user) {

  const sql = require("mssql");

    const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("x3user", sql.NVarChar, user.erp_customer_code)
    .input("site", sql.NVarChar, user.site)
    .query(`
      SELECT DISTINCT A.NUM_0, A.INVDAT_0,
             A.AMTATI_0, A.CUR_0,
             A.INVSTA_0, STRDUDDAT_0
      FROM tbs.TMSNEW.SINVOICE A
      LEFT JOIN tbs.TMSNEW.GACCDUDATE B ON A.NUM_0 = B.NUM_0
      WHERE  A.BPR_0=@x3user
        AND B.FLGCLE_0 = 1
      ORDER BY STRDUDDAT_0 DESC
    `);

  return result.recordset;
}


async getAllPayments(user) {

  const sql = require("mssql");

    const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("x3user", sql.NVarChar, user.erp_customer_code)
    .input("site", sql.NVarChar, user.site)
    .query(`
      SELECT A.NUM_0, A.STA_0, A.FCY_0,
             A.BPR_0, A.ACCDAT_0,
             A.CUR_0, A.AMTCUR_0,
             A.DUDDAT_0
      FROM tbs.TMSNEW.PAYMENTH A
      WHERE  A.BPR_0=@x3user
      ORDER BY A.ACCDAT_0 DESC
    `);

  for (const row of result.recordset) {

    const details = await pool.request()
      .input("site", sql.NVarChar, user.site)
      .input("paymentno", sql.NVarChar, row.NUM_0)
      .query(`
        SELECT A.VCRNUM_0, A.AMTLIN_0, B.CUR_0
        FROM tbs.TMSNEW.PAYMENTD A
        LEFT JOIN tbs.TMSNEW.PAYMENTH B
          ON A.NUM_0 = B.NUM_0
        WHERE  A.NUM_0=@paymentno
      `);

    row.details = details.recordset;
  }

  return result.recordset;
}

async getPaymentDetail(id, user) {

  const sql = require("mssql");

    const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };
  const pool = await sql.connect(config);

  const headerRes = await pool.request()
    .input("orderNo", sql.NVarChar, id)
    .query(`
      SELECT *
      FROM tbs.TMSNEW.PAYMENTH
      WHERE NUM_0=@orderNo
    `);

  if (!headerRes.recordset.length) return [];

  const header = headerRes.recordset[0];

  const itemsRes = await pool.request()
    .input("site", sql.NVarChar, header.FCY_0)
    .input("orderNo", sql.NVarChar, id)
    .query(`
      SELECT A.VCRNUM_0, A.AMTLIN_0, B.CUR_0
      FROM tbs.TMSNEW.PAYMENTD A
      LEFT JOIN tbs.TMSNEW.PAYMENTH B
        ON A.NUM_0 = B.NUM_0
      WHERE  A.NUM_0=@orderNo
    `);

  return {
    header,
    details: itemsRes.recordset
  };
}


async getPaymentPendingInvoices(user) {

  const sql = require("mssql");

    const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

  const pool = await sql.connect(config);

  const result = await pool.request()
    .input("x3user", sql.NVarChar, user.erp_customer_code)
    .input("site", sql.NVarChar, user.site)
    .query(`
      SELECT A.NUM_0, A.INVDAT_0,
             A.AMTATI_0, A.CUR_0,
             STRDUDDAT_0
      FROM tbs.TMSNEW.SINVOICE A
      LEFT JOIN tbs.TMSNEW.GACCDUDATE B
        ON A.NUM_0 = B.NUM_0
      WHERE A.BPR_0=@x3user
        AND B.FLGCLE_0 = 1
      ORDER BY STRDUDDAT_0 DESC
    `);

  return result.recordset;
}


 // STOCK

 async getStockFromDb(filters = {}) {
    
  const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     port: parseInt(process.env.ERP_DB_PORT),
      options: {
    encrypt: false, // or true depending on your setup
    trustServerCertificate: true,
  },
   };

   const pool = await sql.connect(config);
  
  let query = `
    select PRODUCT,PROD_DESC, SITE, PHYSICAL_QTY, ALLOCATED_QTY,AVAILABLE_QTY,UNIT,LOCATION,CATEGORY  from TMSNEW.XSTDALN_STOCK WHERE 1=1
    `;

   
  const request = pool.request();


  // 🔹 Filters
  if (filters.product) {
    query += " AND PRODUCT = @product";
    request.input("product", sql.VarChar, filters.product);
  }

  if (filters.warehouse) {
    query += " AND LOCATION = @warehouse";
    request.input("warehouse", sql.VarChar, filters.warehouse);
  }

  if (filters.category) {
    query += " AND CATEGORY = @warehouse";
    request.input("category", sql.VarChar, filters.warehouse);
  }
  const result = await request.query(query);

  return result.recordset;


 //  return result.recordset;

  }

}

module.exports = SageX3Adapter;