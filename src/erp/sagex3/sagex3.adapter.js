const BaseERPAdapter = require("../base.adapter");
const UserModel = require("../../models/user.model");

const {
  sql,
  poolPromise
} = require("../../config/erp-db");

class SageX3Adapter extends BaseERPAdapter {

  // =====================================================
  // CUSTOMERS
  // =====================================================

  async getCustomers() {

    const pool = await poolPromise;

    const result = await pool.request().query(`

      SELECT

        BPCNUM_0 AS CUSTOMER_CODE,

        BPCNAM_0 AS CUSTOMER_NAME

      FROM LEWISB.BPCUSTOMER

      ORDER BY BPCNAM_0
    `);

    return result.recordset;
  }

  // =====================================================
  // SUPPLIERS
  // =====================================================

  async getSuppliers() {

    const pool = await poolPromise;

    const result = await pool.request().query(`

      SELECT

        BPSNUM_0 AS SUPPLIER_CODE,

        BPSNAM_0 AS SUPPLIER_NAME

      FROM LEWISB.BPSUPPLIER

      ORDER BY BPSNAM_0
    `);

    return result.recordset;
  }

  // =====================================================
  // PRODUCTS
  // =====================================================

  async getProducts(filters = {}) {

    const pool =
      await poolPromise;

    const request =
      pool.request();

    let query = `

      SELECT DISTINCT

        I.ITMREF_0 AS PROD_CODE,

        I.TCLCOD_0 AS CATEGORY,

        I.ITMDES1_0 AS PROD_DESC,

        C.BLOB_0 AS PROD_IMG,

        I.STU_0 AS UOM,

        F.STOFCY_0 AS SITE,

        10 AS BASE_PRICE

      FROM LEWISB.ITMMASTER I

      LEFT JOIN LEWISB.CBLOB C

        ON I.ITMREF_0 = C.IDENT1_0

        AND C.CODBLB_0 = 'ITM'

      INNER JOIN LEWISB.ITMFACILIT F

        ON I.ITMREF_0 = F.ITMREF_0

      WHERE 1=1
    `;

    // CATEGORY

    if (filters.category) {

      query += `
        AND I.TCLCOD_0 = @category
      `;

      request.input(
        "category",
        sql.VarChar,
        filters.category
      );
    }

    // MULTIPLE SITES

    if (filters.sites?.length) {

      const siteParams = [];

      filters.sites.forEach((site, index) => {

        const param = `site${index}`;

        siteParams.push(`@${param}`);

        request.input(
          param,
          sql.VarChar,
          site
        );
      });

      query += `
        AND F.STOFCY_0 IN (${siteParams.join(",")})
      `;
    }

    console.time("GET_PRODUCTS");

    const result =
      await request.query(query);

    console.timeEnd("GET_PRODUCTS");

    return result.recordset;
  }

  // =====================================================
  // PRODUCT CATEGORIES
  // =====================================================

  async getProductCategories() {

    const pool = await poolPromise;

    const result = await pool.request().query(`

      SELECT DISTINCT

        TCLCOD_0 AS CATEGORY_CODE

      FROM LEWISB.ITMMASTER

      WHERE TCLCOD_0 IS NOT NULL

      ORDER BY TCLCOD_0
    `);

    return result.recordset;
  }

  // =====================================================
  // CUSTOMER ADDRESSES
  // =====================================================

  async getCustomerAddresses(customerCode) {

    const pool = await poolPromise;

    const request = pool.request();

    request.input(
      "customerCode",
      sql.VarChar,
      customerCode
    );

    const result = await request.query(`

      SELECT

        BPAADD_0 AS ADDRESS_CODE,

        BPAADDLIG_0 AS ADDRESS_LINE1,

        POSCOD_0 AS ZIP_CODE,

        CTY_0 AS CITY,

        CRY_0 AS COUNTRY

      FROM LEWISB.BPADDRESS

      WHERE BPANUM_0 = @customerCode
    `);

    return result.recordset;
  }

  // =====================================================
  // SUPPLIER ADDRESSES
  // =====================================================

  async getSupplierAddresses(supplierCode) {

    const pool = await poolPromise;

    const request = pool.request();

    request.input(
      "supplierCode",
      sql.VarChar,
      supplierCode
    );

    const result = await request.query(`

      SELECT

        BPAADD_0 AS ADDRESS_CODE,

        BPAADDLIG_0 AS ADDRESS_LINE1,

        POSCOD_0 AS ZIP_CODE,

        CTY_0 AS CITY,

        CRY_0 AS COUNTRY

      FROM LEWISB.BPADDRESS

      WHERE BPANUM_0 = @supplierCode
    `);

    return result.recordset;
  }

  // =====================================================
  // STOCK
  // =====================================================

  async getStock(filters = {}) {

    const pool = await poolPromise;

    const request = pool.request();

    let query = `

      SELECT

        ITMREF_0 AS PROD_CODE,

        STOFCY_0 AS SITE,

        QTYSTU_0 AS STOCK_QTY

      FROM LEWISB.STOCK

      WHERE 1=1
    `;

    if (filters.productCode) {

      query += `
        AND ITMREF_0 = @productCode
      `;

      request.input(
        "productCode",
        sql.VarChar,
        filters.productCode
      );
    }

    if (filters.site) {

      query += `
        AND STOFCY_0 = @site
      `;

      request.input(
        "site",
        sql.VarChar,
        filters.site
      );
    }

    const result =
      await request.query(query);

    return result.recordset;
  }

  // =====================================================
  // ALL SITES
  // =====================================================

  async getAllSites() {

    const pool = await poolPromise;

    const result = await pool.request().query(`

      SELECT DISTINCT

        FCY_0 AS SITE_CODE,

        FCYNAM_0 AS SITE_NAME

      FROM LEWISB.FACILITY

      ORDER BY FCYNAM_0
    `);

    return result.recordset;
  }

  // =====================================================
  // PRICE LISTS
  // =====================================================

  async getPriceLists(filters = {}) {

    const pool =
      await poolPromise;

    const request =
      pool.request();

    let query = `

      SELECT

        PLI_0,

        PLICRI_0,

        PLICRI1_0,

        PRI_0,

        DCGVAL_0,

        MINQTY_0,

        MAXQTY_0,

        PLISTRDAT_0,

        PLIENDDAT_0

      FROM LEWISB.SPRICLIST

      WHERE

        GETDATE()

        BETWEEN

        PLISTRDAT_0

        AND

        PLIENDDAT_0

        AND PLI_0 IN (
          'T10',
          'T11',
          'T20',
          'T21'
        )
    `;

    if (filters.customer) {

      query += `

        AND (

          PLICRI_0 = @customer

          OR

          PLI_0 IN (
            'T10',
            'T11'
          )
        )
      `;

      request.input(
        "customer",
        sql.VarChar,
        filters.customer
      );
    }

    console.time("GET_PRICELISTS");

    const result =
      await request.query(query);

    console.timeEnd("GET_PRICELISTS");

    return result.recordset;
  }
}

module.exports = SageX3Adapter;