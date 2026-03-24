const BaseERPAdapter = require("../base.adapter");

class SageX3Adapter extends BaseERPAdapter {
    

 async getCustomers(){

      return this.getCustomersFromDB();
 }

 async getSuppliers(){

      return this.getSuppliersFromDB();
 }

 async getCustomerAddresses(customerCode) {
   return this.db.getCustomerAddresses(customerCode);
 }

 async getSupplierAddresses(supplierCode) {
   return this.db.getSupplierAddresses(supplierCode);
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


async getCustomerAddresses(customerCode) {

  const sql = require("mssql");

  const pool = await sql.connect(this.config);

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




}

module.exports = SageX3Adapter;