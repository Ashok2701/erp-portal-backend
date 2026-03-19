const BaseERPAdapter = require("../base.adapter");

class SageX3Adapter extends BaseERPAdapter {
    

 async getCustomers(){

      return this.getCustomersFromDB();
 }

 async getSuppliers(){

      return this.getSuppliersFromDB();
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



}

module.exports = SageX3Adapter;