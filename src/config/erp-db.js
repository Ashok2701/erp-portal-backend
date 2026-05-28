const sql = require("mssql");

const config = {
  user: process.env.ERP_DB_USER,
  password: process.env.ERP_DB_PASSWORD,
  server: process.env.ERP_DB_HOST,
  database: process.env.ERP_DB_NAME,
  port: parseInt(process.env.ERP_DB_PORT),

  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {

    console.log("ERP SQL Server Connected");

    return pool;
  })
  .catch(err => {

    console.error("ERP DB Connection Failed", err);

    throw err;
  });

module.exports = {
  sql,
  poolPromise
};