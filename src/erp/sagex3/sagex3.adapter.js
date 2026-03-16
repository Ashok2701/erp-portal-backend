const BaseERPAdapter = require("../base.adapter");

class SageX3Adapter extends BaseERPAdapter {
    

 async getCustomers(){

      return this.getCustomersFromDB();
 }

 async getCustomersFromDB(){

   const sql = require("mssql");

   const config = {
     user: process.env.ERP_DB_USER,
     password: process.env.ERP_DB_PASSWORD,
     server: process.env.ERP_DB_HOST,
     database: process.env.ERP_DB_NAME,
     //port: parseInt(process.env.ERP_DB_PORT)
   };

   const pool = await sql.connect(config);

   const result = await pool.request().query(`
     SELECT
       BPCNUM AS customer_code,
       BPCNAM AS customer_name
     FROM BPCUSTOMER
   `);

   return result.recordset;

 }



}

module.exports = SageX3Adapter;