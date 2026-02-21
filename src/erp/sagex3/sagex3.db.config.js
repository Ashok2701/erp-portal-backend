const { Pool } = require("pg"); // or mssql / mysql depending on ERP

const pool = new Pool({
  host: process.env.SAGE_X3_DB_HOST,
  port: process.env.SAGE_X3_DB_PORT,
  database: process.env.SAGE_X3_DB_NAME,
  user: process.env.SAGE_X3_DB_USER,
  password: process.env.SAGE_X3_DB_PASSWORD,
  ssl: false
});

module.exports = pool;
