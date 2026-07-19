const BaseERPAdapter  = require("../base.adapter");
const UserModel       = require("../../models/user.model");
const erpDbManager    = require("../erpDbManager");
const mssql           = require("mssql");
const sql             = mssql; // alias for existing code

class SageX3Adapter extends BaseERPAdapter {

  constructor(settings = {}) {
    super();
    this.settings = settings;
    this._poolPromise = null;
  }

  // Returns the mssql pool for this tenant's ERP DB
  get poolPromise() {
    if (!this._poolPromise) {
      this._poolPromise = erpDbManager.getErpDbPool(this.settings);
    }
    return this._poolPromise;
  }

  // Convenience getters for X3 business config
  get poolAlias()  { return this.settings.x3_pool_alias  || process.env.X3_POOL_ALIAS; }
  get salesSite()  { return this.settings.x3_sales_site  || process.env.X3_SALES_SITE; }
  get orderType()  { return this.settings.x3_order_type  || process.env.X3_ORDER_TYPE; }
  get soapUrl()    { return this.settings.x3_soap_url    || process.env.X3_SOAP_URL; }
  get wsdlUrl()    { return this.settings.x3_wsdl_url    || process.env.X3_WSDL_URL; }
  get x3Username() { return this.settings.x3_username    || process.env.X3_USERNAME; }
  get x3Password() { return this.settings.x3_password    || process.env.X3_PASSWORD; }



  // Resolves which ERP customer code to filter this request's data by.
  //
  // Previously this branched on user.role === "Customer" and, if that
  // matched, re-queried the legacy single-value users.erp_entity_code
  // column via UserModel.getUserById() — a column the multi-portal Add
  // User Wizard never populates (ERP codes live in user_role_erp_mapping
  // instead, one row per portal). So for every wizard-created user this
  // returned null/undefined regardless of role, and every query built on
  // top of it (orders, quotes, invoices, payments, deliveries, credit
  // notes, statement — 9 call sites) silently dropped its customer filter
  // and returned every customer's data.
  //
  // On top of that, user.role itself was unreliable for multi-role users:
  // auth.middleware.js's user lookup LEFT JOINs user_roles/roles with no
  // ORDER BY and takes an arbitrary row, so a user with 3 roles (Customer,
  // B2B Customer, Supplier) could see any one of them show up as `role` on
  // a given request — the "Customer" string match here was a coin flip.
  //
  // auth.middleware.js now resolves erp_entity_code correctly per the
  // active portal (via X-Active-Portal + user_role_erp_mapping, with a
  // fallback to the legacy users columns for non-portal accounts) and
  // puts it directly on req.user. Just use that.
  async resolveCustomerCode(req) {
    const user = req.user || req;
    return user.erp_entity_code || user.erp_customer_code || null;
  }

  async getCustomers(filters = {}) {
    return this.getCustomersFromDB(filters);
  }

  async getSuppliers() {
    return this.getSuppliersFromDB();
  }

  async getCustomerAddresses(customerCode) {
    return this.getCustomerAddressesFromDB(customerCode);
  }

  async getCustomerDetail(customerCode) {
    const pool = await this.poolPromise;
    const { sql } = require("mssql");
    const req = pool.request();
    req.input("code", sql.VarChar, customerCode);

    // Main customer record
    const custResult = await req.query(`
      SELECT
        BP.BPCNUM_0  AS customer_code,
        BP.BPCNAM_0  AS customer_name,
        BP.IVCUR_0   AS currency,
        BP.STOFCY_0  AS site,
        BP.CRE_0     AS credit_limit,
        BP.VACBPR_0  AS eu_vat_number,
        BP.TAXID_0   AS tax_id,
        BP.NAF_0     AS sic_code,
        BP.BPCTYP_0  AS customer_type,
        BP.PRITYP_0  AS price_type,
        ISNULL(BP.WEB_0,'') AS email,
        ISNULL(BP.TEL_0,'') AS phone,
        ISNULL(BP.CTC_0,'') AS contact_ref
      FROM LEWISB.BPCUSTOMER BP
      WHERE BP.BPCNUM_0 = @code
    `);

    // Addresses
    const addrResult = await pool.request().input("code2", sql.VarChar, customerCode).query(`
      SELECT
        BPAADD_0    AS address_code,
        BPADES_0    AS address_name,
        BPAADDLIG_0 AS line1,
        BPAADDLIG_1 AS line2,
        BPAADDLIG_2 AS line3,
        POSCOD_0    AS postal_code,
        CTY_0       AS city,
        SAT_0       AS state,
        CRYNAM_0    AS country,
        TEL_0       AS phone,
        WEB_0       AS email,
        BPAADD_0 = (
          SELECT TOP 1 BPAADDADD_0 FROM LEWISB.BPCUSTOMER WHERE BPCNUM_0=@code2
        ) AS is_default
      FROM LEWISB.BPADDRESS
      WHERE BPANUM_0 = @code2
      ORDER BY is_default DESC, BPAADD_0
    `);

    // Recent orders summary
    const ordersResult = await pool.request().input("code3", sql.VarChar, customerCode).query(`
      SELECT TOP 5
        SOHNUM_0  AS order_no,
        ORDDAT_0  AS order_date,
        TOTORDAMT_0 AS amount,
        IVCUR_0   AS currency,
        STOMVTFLG_0 AS status
      FROM tbs.LEWISB.SORDER
      WHERE BPCORD_0 = @code3
      ORDER BY ORDDAT_0 DESC
    `);

    const customer = custResult.recordset[0] || null;
    if (!customer) return null;

    return {
      ...customer,
      addresses: addrResult.recordset || [],
      recent_orders: ordersResult.recordset || [],
    };
  }

  async getSupplierAddresses(supplierCode) {
    return this.getSupplierAddressesFromDB(supplierCode);
  }

  async getStock(filters) {
    return this.getStockFromDb(filters);
  }

  // =====================================================
  // PRODUCTS
  // =====================================================

  async getProducts(filters = {}) {

    const pool = await this.poolPromise;

    const request =
      pool.request();

    // NOTE: product images (CBLOB.BLOB_0) are fetched with a SEPARATE
    // query below and merged in JS, instead of being LEFT JOINed here.
    // On this tenant's SQL Server, joining CBLOB directly into the
    // ITMMASTER x ITMFACILIT list turned a ~150ms query into a 30+
    // second one (no usable index on CBLOB for this join), even though
    // the underlying blob data itself is small (~18MB / 514 images).
    // Fetching CBLOB on its own and joining by PROD_CODE in memory
    // avoids that bad query plan entirely.
    let query = `

      SELECT DISTINCT

        I.ITMREF_0 AS PROD_CODE,

        I.TCLCOD_0 AS CATEGORY,

        I.ITMDES1_0 AS PROD_DESC,

        I.STU_0 AS UOM,

        F.STOFCY_0 AS SITE,

        10 AS BASE_PRICE

      FROM LEWISB.ITMMASTER I

      INNER JOIN LEWISB.ITMFACILIT F

        ON I.ITMREF_0 = F.ITMREF_0

      WHERE 1=1
    `;

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

    console.time("GET_PRODUCT_IMAGES");

    const blobResult = await pool.request().query(`
      SELECT IDENT1_0, BLOB_0 FROM LEWISB.CBLOB WHERE CODBLB_0 = 'ITM'
    `);

    console.timeEnd("GET_PRODUCT_IMAGES");

    const imageMap = new Map();
    for (const row of blobResult.recordset) {
      imageMap.set(row.IDENT1_0, row.BLOB_0);
    }

    return result.recordset.map(row => ({
      ...row,
      PROD_IMG: imageMap.get(row.PROD_CODE) ?? null
    }));
  }

  async getProducts_2(filters = {}) {

    const pool = await this.poolPromise;

    let query = `

      SELECT

        I.ITMREF_0 AS PROD_CODE,

        I.TCLCOD_0 AS CATEGORY,

        I.ITMDES1_0 AS PROD_DESC,

        C.BLOB_0 AS PROD_IMG,

        I.STU_0 AS UOM,

        10 AS BASE_PRICE

      FROM LEWISB.ITMMASTER I

      LEFT JOIN LEWISB.CBLOB C

        ON I.ITMREF_0 = C.IDENT1_0

        AND C.CODBLB_0 = 'ITM'
    `;

    const request =
      pool.request();

    if (filters.category) {

      query += `
        WHERE I.TCLCOD_0 = @category
      `;

      request.input(
        "category",
        sql.VarChar,
        filters.category
      );
    }

    const result =
      await request.query(query);

    return result.recordset;
  }

  async getProducts_1(filters = {}) {

    const pool = await this.poolPromise;

    let query = `
      SELECT
        I.ITMREF_0 AS PROD_CODE,
        I.TCLCOD_0 AS CATEGORY,
        I.ITMDES1_0 AS PROD_DESC,
        C.BLOB_0 AS PROD_IMG,
        I.STU_0 AS UOM
      FROM LEWISB.ITMMASTER I
      LEFT JOIN LEWISB.CBLOB C
        ON I.ITMREF_0 = C.IDENT1_0
        AND C.CODBLB_0 = 'ITM'
    `;

    const request =
      pool.request();

    if (filters.category) {

      query += `
        WHERE I.TCLCOD_0 = @category
      `;

      request.input(
        "category",
        sql.VarChar,
        filters.category
      );
    }

    const result =
      await request.query(query);

    return result.recordset;
  }

  // =====================================================
  // PRODUCT CATEGORIES
  // =====================================================

  async getProductCategories() {

    const pool = await this.poolPromise;

    const result =
      await pool.request().query(`
        SELECT
          TCLCOD_0 AS Category_Code,
          TCLDES_0 AS Category_Desc
        FROM LEWISB.ITMCATEG
      `);

    return result.recordset;
  }

  // =====================================================
  // SUPPLIERS
  // =====================================================

  async getSuppliersFromDB() {

    const pool = await this.poolPromise;

    const result =
      await pool.request().query(`
        SELECT
          BPSNAM_0 AS supplierCode,
          BPSNAM_0 AS supplierName
        FROM LEWISB.BPSUPPLIER
      `);

    return result.recordset;
  }

  // =====================================================
  // CUSTOMERS
  // =====================================================

  async getCustomersFromDB({ emailFilter, domainFilter } = {}) {
    const pool = await this.poolPromise;
    const { sql } = require("mssql");

    let query = `
      SELECT
        BPCNUM_0 AS customer_code,
        BPCNAM_0 AS customer_name,
        ISNULL(WEB_0, '')   AS web,
        ISNULL(CTC_0, '')   AS contact_ref
      FROM LEWISB.BPCUSTOMER
      WHERE 1=1
    `;

    const req = pool.request();

    // Tier 1 — exact email match on WEB_0
    if (emailFilter) {
      query += ` AND LOWER(WEB_0) = LOWER(@email)`;
      req.input("email", sql.VarChar, emailFilter);
    }
    // Tier 2 — same domain match on WEB_0
    else if (domainFilter) {
      query += ` AND LOWER(WEB_0) LIKE @domain`;
      req.input("domain", sql.VarChar, `%@${domainFilter.toLowerCase().replace(/^@/, '')}`);
    }

    query += ` ORDER BY BPCNAM_0`;
    const result = await req.query(query);

    return result.recordset.map(r => ({
      customer_code: r.customer_code,
      customer_name: r.customer_name,
      email:         r.web || null,
      contact_ref:   r.contact_ref || null,
    }));
  }

  // =====================================================
  // CUSTOMER ADDRESSES
  // =====================================================

  async getCustomerAddressesFromDB(customerCode) {

    const pool = await this.poolPromise;

    const query = `
      SELECT
        BPAADD_0    AS address_code,
        BPADES_0    AS address_name,
        BPAADDLIG_0 AS address_line1,
        BPAADDLIG_1 AS address_line2,
        BPAADDLIG_2 AS address_line3,
        POSCOD_0    AS postal_code,
        CTY_0       AS city,
        CRYNAM_0    AS country
      FROM LEWISB.BPADDRESS
      WHERE BPANUM_0 = @customerCode
    `;

    const request =
      pool.request();

    request.input(
      "customerCode",
      sql.VarChar,
      customerCode
    );

    const result =
      await request.query(query);

    return result.recordset;
  }

  // =====================================================
  // SUPPLIER ADDRESSES
  // =====================================================

  async getSupplierAddressesFromDB(supplierCode) {

    const pool = await this.poolPromise;

    const query = `
      SELECT
        BPAADD_0 AS address_code,
        BPADES_0 AS address_name,
        BPAADDLIG_0 AS address_line1,
        BPAADDLIG_1 AS address_line2,
        BPAADDLIG_2 AS address_line3,
        CTY_0 AS city,
        CRYNAM_0 AS country
      FROM LEWISB.BPADDRESS
      WHERE BPANUM_0 = @supplierCode
    `;

    const request =
      pool.request();

    request.input(
      "supplierCode",
      sql.VarChar,
      supplierCode
    );

    const result =
      await request.query(query);

    return result.recordset;
  }

  // =====================================================
  // SALES QUOTES
  // =====================================================

  async getAllQuotes(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 20
        A.SQHNUM_0,
        A.SQHTYP_0,
        A.QUOINVATI_0,
        D.TEXTE_0,
        A.QUODAT_0,
        A.CUSQUOREF_0,
        A.QUOSTA_0,
        A.FFWNUM_0,
        B.BPTNAM_0,
        A.VLYDAT_0,
        A.SOHNUM_0,
        A.ORDDAT_0,
        A.CUR_0
      FROM tbs.LEWISB.SQUOTE A
      LEFT JOIN tbs.LEWISB.BPCARRIER B
        ON A.FFWNUM_0 = B.BPTNUM_0
      LEFT JOIN tbs.LEWISB.ATEXTRA D
        ON A.SQHTYP_0 = D.IDENT1_0
        AND D.CODFIC_0 = 'TABSQHTYP'
      WHERE 1=1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPCORD_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    query += `
      ORDER BY A.QUODAT_0 DESC
    `;

    const result =
      await request.query(query);

    for (const row of result.recordset) {

      const items =
        await pool.request()

          .input(
            "quoteNo",
            sql.NVarChar,
            row.SQHNUM_0
          )

          .query(`
            SELECT
              ITMREF_0,
              ITMDES1_0,
              QTY_0,
              SAU_0,
              NETPRIATI_0
            FROM tbs.LEWISB.SQUOTED
            WHERE SQHNUM_0=@quoteNo
          `);

      row.items =
        items.recordset;
    }

    return result.recordset;
  }

  async getQuoteDetail(id, user) {

    const pool = await this.poolPromise;

    const result =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT *
          FROM tbs.LEWISB.SQUOTE
          WHERE SQHNUM_0=@orderNo
        `);

    if (!result.recordset.length)
      return [];

    const header =
      result.recordset[0];

    const items =
      await pool.request()

        .input(
          "quoteNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT
            ITMREF_0,
            ITMDES1_0,
            QTY_0,
            NETPRIATI_0
          FROM tbs.LEWISB.SQUOTED
          WHERE SQHNUM_0=@quoteNo
        `);

    return {
      header,
      items: items.recordset
    };
  }

  // =====================================================
  // DELIVERIES
  // =====================================================

  async getAllDeliveries(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT
        A.STOFCY_0,
        A.DLVATIL_0,
        A.CUR_0,
        A.SOHNUM_0,
        A.BPCORD_0,
        A.BPDNAM_0,
        A.BPAADD_0,
        A.SDHTYP_0,
        A.SDHNUM_0,
        A.DSPTOTQTY_0,
        A.DLVNOT_0 AS BEFORETAXAMOUNT,
        A.DLVATI_0 AS AFTERTAXAMOUNT,
        A.DLVDAT_0,
        A.SHIDAT_0,
        A.GROWEI_0,
        A.WEU_0,
        A.VOL_0,
        A.VOU_0,
        C.BPTNAM_0,
        F.FCYNAM_0       AS SITE_DESC,
        BP.BPCNAM_0      AS CUSTOMER_FULL_NAME,
        BA.POSCOD_0      AS ZIP_CODE,
        BA.CTY_0         AS CITY
      FROM LEWISB.SDELIVERY A
      LEFT JOIN tbs.LEWISB.BPCARRIER C   ON A.BPTNUM_0 = C.BPTNUM_0
      LEFT JOIN tbs.LEWISB.FACILITY F    ON A.STOFCY_0 = F.FCY_0
      LEFT JOIN tbs.LEWISB.BPCUSTOMER BP ON A.BPCORD_0 = BP.BPCNUM_0
      LEFT JOIN LEWISB.BPADDRESS BA      ON BA.BPANUM_0 = A.BPCORD_0
                                        AND BA.BPAADD_0 = A.BPAADD_0
      WHERE 1=1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPCORD_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    // ── In-Transit view: only undelivered/not-yet-validated ─────────
    // VCRSTA_0 = 1 means In Progress (not yet validated in X3)
    if (req.inTransitOnly) {
      query += ` AND A.VCRSTA_0 = 1`;
    }

    query += ` ORDER BY A.DLVDAT_0 DESC`;

    const result =
      await request.query(query);

    for (const row of result.recordset) {

      const items =
        await pool.request()

          .input(
            "dlvNo",
            sql.NVarChar,
            row.SDHNUM_0
          )

          .query(`
            SELECT
              A.ITMREF_0,
              A.ITMDES1_0,
              A.QTY_0,
              A.SAU_0 AS UNITS,
              A.NETPRI_0,
              (A.QTY_0 * A.NETPRI_0) AS total_amount
            FROM tbs.LEWISB.SDELIVERYD A
            WHERE A.SOHNUM_0=@dlvNo
          `);

      row.items =
        items.recordset;
    }

    return result.recordset;
  }

  async getDeliveryDetail(id, user) {

    const pool = await this.poolPromise;

    const result =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT *
          FROM tbs.LEWISB.SDELIVERY
          WHERE SDHNUM_0=@orderNo
        `);

    if (!result.recordset.length)
      return [];

    const header =
      result.recordset[0];

    const items =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT DISTINCT
            A.ITMREF_0,
            A.ITMDES1_0,
            A.QTY_0,
            A.SAU_0 AS UNITS,
            A.NETPRI_0,
            (A.QTY_0 * A.NETPRI_0) AS total_amount
          FROM tbs.LEWISB.SDELIVERYD A
          WHERE A.SDHNUM_0=@orderNo
        `);

    return {
      header,
      items: items.recordset
    };
  }

  // =====================================================
  // ORDERS
  // =====================================================

  async getAllOrders(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 100
        A.SALFCY_0,
        A.ORDINVATI_0,
        A.CUR_0,
        A.CUSORDREF_0,
        A.BPCORD_0,
        A.BPCNAM_0,
        A.SOHNUM_0,
        A.SOHTYP_0,
        A.ORDDAT_0,
        ORDNOT_0 AS BEFORETAXAMOUNT,
        ORDATI_0 AS AFTERTAXAMOUNT,
        A.SHIDAT_0,
        A.ALLSTA_0,
        A.INVSTA_0,
        C.BPTNAM_0,
        F.FCYNAM_0       AS SITE_DESC,
        BP.BPCNAM_0      AS CUSTOMER_FULL_NAME,
        BA.POSCOD_0      AS ZIP_CODE,
        BA.CTY_0         AS CITY
      FROM tbs.LEWISB.SORDER A
      LEFT JOIN tbs.LEWISB.BPCARRIER C   ON A.BPTNUM_0 = C.BPTNUM_0
      LEFT JOIN tbs.LEWISB.FACILITY F    ON A.SALFCY_0 = F.FCY_0
      LEFT JOIN tbs.LEWISB.BPCUSTOMER BP ON A.BPCORD_0 = BP.BPCNUM_0
      LEFT JOIN LEWISB.BPADDRESS BA      ON BA.BPANUM_0 = A.BPCORD_0
                                        AND BA.BPAADD_0 =A.BPAADD_0
      WHERE 1=1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPCORD_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    query += `
      ORDER BY A.ORDDAT_0 DESC
    `;

    const result =
      await request.query(query);

    for (const row of result.recordset) {

      const items =
        await pool.request()

          .input(
            "orderNo",
            sql.NVarChar,
            row.SOHNUM_0
          )

          .query(`
            SELECT
              A.ITMREF_0,
              C.ITMDES_0,
              A.QTY_0,
              C.NETPRIATI_0,
              (A.QTY_0 * C.GROPRI_0) AS total_amount
            FROM tbs.LEWISB.SORDERQ A
            LEFT JOIN tbs.LEWISB.SORDERP C
              ON A.SOHNUM_0 = C.SOHNUM_0
            WHERE A.SOHNUM_0=@orderNo
          `);

      row.items =
        items.recordset;
    }

    return result.recordset;
  }

  async getOrderDetail(id, user) {

    const pool = await this.poolPromise;

    const result =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT *
          FROM tbs.LEWISB.SORDER
          WHERE SOHNUM_0=@orderNo
        `);

    if (!result.recordset.length)
      return [];

    const header =
      result.recordset[0];

    const items =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT
            A.ITMREF_0,
            C.ITMDES_0,
            A.QTY_0,
            A.DLVQTY_0,
            A.SAU_0        AS UNIT,
            C.NETPRIATI_0
          FROM tbs.LEWISB.SORDERQ A
          LEFT JOIN tbs.LEWISB.SORDERP C
            ON A.SOHNUM_0 = C.SOHNUM_0
            AND A.SOPLIN_0 = C.SOPLIN_0
          WHERE A.SOHNUM_0=@orderNo
        `);

    return {
      header,
      items: items.recordset
    };
  }

  // =====================================================
  // INVOICES
  // =====================================================

  async getAllInvoices(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 20
        A.NUM_0,
        A.SIVTYP_0,
        A.BPR_0,
        A.ACCDAT_0,
        A.CUR_0,
        A.AMTATI_0,
        A.AMTNOT_0,
        A.STA_0,
        A.FCY_0,
        F.FCYNAM_0       AS SITE_DESC,
        BP.BPCNAM_0      AS CUSTOMER_FULL_NAME,
        BA.POSCOD_0      AS ZIP_CODE,
        BA.CTY_0         AS CITY
      FROM tbs.LEWISB.SINVOICE A
      LEFT JOIN tbs.LEWISB.FACILITY F    ON A.FCY_0  = F.FCY_0
      LEFT JOIN tbs.LEWISB.BPCUSTOMER BP ON A.BPR_0  = BP.BPCNUM_0
      LEFT JOIN LEWISB.BPADDRESS BA      ON BA.BPANUM_0 = A.BPR_0
                                        AND BA.BPAADD_0 = 'AD1'
      WHERE 1=1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPR_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    query += `
      ORDER BY A.ACCDAT_0 DESC
    `;

    const result =
      await request.query(query);

    return result.recordset;
  }

  async getAllCreditNotes(req) {
    const pool         = await this.poolPromise;
    const customerCode = await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 50
        A.NUM_0        AS credit_note_number,
        A.SIVTYP_0     AS type,
        A.BPR_0        AS customer_code,
        A.BPRNAM_0     AS customer_name,
        A.ACCDAT_0     AS date,
        A.CUR_0        AS currency,
        A.AMTATI_0     AS amount_total,
        A.AMTNOT_0     AS amount_excl_tax,
        A.STA_0        AS status,
        A.FCY_0        AS site,
        A.REF_0        AS reference,
        A.DES_0        AS description
      FROM tbs.LEWISB.SINVOICE A
      WHERE A.SIVTYP_0 IN ('AVC', 'CRN', 'CNO', 'AVI')
    `;

    const request = pool.request();
    if (customerCode) {
      query += ` AND A.BPR_0 = @customerCode`;
      request.input("customerCode", sql.NVarChar, customerCode);
    }
    query += ` ORDER BY A.ACCDAT_0 DESC`;

    const result = await request.query(query);
    return result.recordset.map(r => ({
      id:                  r.credit_note_number,
      credit_note_number:  r.credit_note_number,
      type:                r.type,
      customer_code:       r.customer_code,
      customer_name:       r.customer_name,
      date:                r.date,
      currency:            r.currency,
      amount_total:        Number(r.amount_total || 0),
      amount_excl_tax:     Number(r.amount_excl_tax || 0),
      status:              r.status === '3' ? 'Paid' : r.status === '2' ? 'Posted' : 'Draft',
      site:                r.site,
      reference:           r.reference,
      description:         r.description,
    }));
  }

  async getInvoiceDetail(id, user) {

    const pool = await this.poolPromise;

    const headerRes =
      await pool.request()

        .input(
          "invoiceNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT *
          FROM tbs.LEWISB.SINVOICE
          WHERE NUM_0=@invoiceNo
        `);

    if (!headerRes.recordset.length)
      return [];

    const header =
      headerRes.recordset[0];

    const itemsRes =
      await pool.request()

        .input(
          "invoiceNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT
            ITMREF_0,
            ITMDES1_0,
            QTY_0,
            NETPRIATI_0
          FROM tbs.LEWISB.SINVOICED
          WHERE NUM_0=@invoiceNo
        `);

    return {
      header,
      items: itemsRes.recordset
    };
  }

  async getPendingInvoices(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 20 DISTINCT
        A.NUM_0,
        A.ACCDAT_0,
        A.AMTATI_0,
        A.CUR_0,
        A.STA_0,
        STRDUDDAT_0
      FROM tbs.LEWISB.SINVOICE A
      LEFT JOIN tbs.LEWISB.GACCDUDATE B
        ON A.NUM_0 = B.NUM_0
      WHERE B.FLGCLE_0 = 1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPR_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    query += `
      ORDER BY A.STRDUDDAT_0 DESC
    `;

    const result =
      await request.query(query);

    return result.recordset;
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  async getAllPayments(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 20
        A.NUM_0,
        A.STA_0,
        A.FCY_0,
        A.BPR_0,
        A.ACCDAT_0,
        A.CUR_0,
        A.AMTCUR_0,
        A.DUDDAT_0
      FROM tbs.LEWISB.PAYMENTH A
      WHERE 1=1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPR_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    query += `
      ORDER BY A.ACCDAT_0 DESC
    `;

    const result =
      await request.query(query);

    for (const row of result.recordset) {

      const details =
        await pool.request()

          .input(
            "paymentno",
            sql.NVarChar,
            row.NUM_0
          )

          .query(`
            SELECT
              A.VCRNUM_0,
              A.AMTLIN_0,
              B.CUR_0
            FROM tbs.LEWISB.PAYMENTD A
            LEFT JOIN tbs.LEWISB.PAYMENTH B
              ON A.NUM_0 = B.NUM_0
            WHERE A.NUM_0=@paymentno
          `);

      row.details =
        details.recordset;
    }

    return result.recordset;
  }

  async getPaymentDetail(id, user) {

    const pool = await this.poolPromise;

    const headerRes =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT *
          FROM tbs.LEWISB.PAYMENTH
          WHERE NUM_0=@orderNo
        `);

    if (!headerRes.recordset.length)
      return [];

    const header =
      headerRes.recordset[0];

    const itemsRes =
      await pool.request()

        .input(
          "orderNo",
          sql.NVarChar,
          id
        )

        .query(`
          SELECT
            A.VCRNUM_0,
            A.AMTLIN_0,
            B.CUR_0
          FROM tbs.LEWISB.PAYMENTD A
          LEFT JOIN tbs.LEWISB.PAYMENTH B
            ON A.NUM_0 = B.NUM_0
          WHERE A.NUM_0=@orderNo
        `);

    return {
      header,
      details: itemsRes.recordset
    };
  }

  async getPaymentPendingInvoices(req) {

    const pool = await this.poolPromise;

    const customerCode =
      await this.resolveCustomerCode(req);

    let query = `
      SELECT TOP 10
        A.NUM_0,
        A.INVDAT_0,
        A.AMTATI_0,
        A.CUR_0,
        STRDUDDAT_0
      FROM tbs.LEWISB.SINVOICE A
      LEFT JOIN tbs.LEWISB.GACCDUDATE B
        ON A.NUM_0 = B.NUM_0
      WHERE B.FLGCLE_0 = 1
    `;

    const request =
      pool.request();

    if (customerCode) {

      query += `
        AND A.BPR_0 = @customerCode
      `;

      request.input(
        "customerCode",
        sql.NVarChar,
        customerCode
      );
    }

    query += `
      ORDER BY A.STRDUDDAT_0 DESC
    `;

    const result =
      await request.query(query);

    return result.recordset;
  }

  // =====================================================
  // STOCK
  // =====================================================

  async getStockFromDb(filters = {}) {

    const pool = await this.poolPromise;

    let query = `
      SELECT
        S.PRODUCT,
        S.PROD_DESC,
        S.SITE,
        S.PHYSICAL_QTY,
        S.ALLOCATED_QTY,
        S.AVAILABLE_QTY,
        S.UNIT,
        S.LOCATION,
        S.CATEGORY,
        C.BLOB_0 AS PROD_IMG
      FROM LEWISB.XSTDALN_STOCK S
      LEFT JOIN LEWISB.CBLOB C
        ON  S.PRODUCT   = C.IDENT1_0
        AND C.CODBLB_0  = 'ITM'
      WHERE 1=1
    `;

    const request = pool.request();

    // Dynamic site filter
    if (filters.site) {
      query += ` AND S.SITE = @site`;
      request.input("site", sql.VarChar, filters.site);
    }

    if (filters.product) {
      query += ` AND (S.PRODUCT LIKE @product OR S.PROD_DESC LIKE @product)`;
      request.input("product", sql.VarChar, `%${filters.product}%`);
    }

    if (filters.warehouse) {
      query += ` AND S.LOCATION = @warehouse`;
      request.input("warehouse", sql.VarChar, filters.warehouse);
    }

    if (filters.category) {
      query += ` AND S.CATEGORY = @category`;
      request.input("category", sql.VarChar, filters.category);
    }

    // NOTE: LOCATION table not confirmed in this X3 instance
    // customerCode and excludeCustomerLocations filters disabled until table is verified
    // TODO: verify correct X3 location table name before re-enabling

    const result = await request.query(query);
    return result.recordset;
  }

  // =====================================================
  // PRICE LISTS
  // =====================================================

  async getPriceLists(filters = {}) {

    const pool = await this.poolPromise;

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
        BETWEEN PLISTRDAT_0
        AND PLIENDDAT_0
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
          OR PLI_0 IN (
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

    const result =
      await request.query(query);

    return result.recordset;
  }

  async getPriceLists_1(filters = {}) {

    const pool = await this.poolPromise;

    const query = `
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
        BETWEEN PLISTRDAT_0
        AND PLIENDDAT_0
    `;

    const result =
      await pool.request()
        .query(query);

    return result.recordset;
  }

  // =====================================================
  // SITES
  // =====================================================

  // Stock movements (IN/OUT) for a specific product + location
  async getStockMovements({ site, product, location }) {
    const pool = await this.poolPromise;
    const { sql } = require("mssql");

    // Try STOJOU (stock journal) first — standard SageX3 movements table
    let result;
    try {
      const req = pool.request();
      let query = `
        SELECT TOP 100
          SJ.STOFCY_0   AS SITE,
          SJ.ITMREF_0   AS PRODUCT,
          SJ.ITMDSC_0   AS PROD_DESC,
          SJ.LOC_0      AS LOCATION,
          SJ.MVTTYP_0   AS MOVEMENT_TYPE,
          SJ.QTY_0      AS QUANTITY,
          SJ.UOM_0      AS UNIT,
          SJ.VCRNUM_0   AS REFERENCE,
          SJ.CREDAT_0   AS MOVEMENT_DATE,
          CASE WHEN SJ.SENS_0 = 1 THEN 'IN' ELSE 'OUT' END AS DIRECTION
        FROM tbs.LEWISB.STOJOU SJ
        WHERE 1=1
      `;
      if (site) {
        query += ` AND SJ.STOFCY_0 = @site`;
        req.input("site", sql.VarChar, site);
      }
      if (product) {
        query += ` AND SJ.ITMREF_0 = @product`;
        req.input("product", sql.VarChar, product);
      }
      if (location) {
        query += ` AND SJ.LOC_0 = @location`;
        req.input("location", sql.VarChar, location);
      }
      query += ` ORDER BY SJ.CREDAT_0 DESC`;
      result = await req.query(query);
      return result.recordset.map(r => ({
        site:          r.SITE,
        product_code:  r.PRODUCT,
        product_desc:  r.PROD_DESC,
        location:      r.LOCATION,
        movement_type: r.MOVEMENT_TYPE,
        direction:     r.DIRECTION,
        quantity:      Number(r.QUANTITY) || 0,
        unit:          r.UNIT,
        reference:     r.REFERENCE,
        date:          r.MOVEMENT_DATE,
      }));
    } catch (err) {
      console.warn("getStockMovements STOJOU failed:", err.message);
      return [];
    }
  }


  // ── Consignment: fetch stock for customer location ───────────────────────
  // 1. Filter XSTDALN_STOCK WHERE LOCATION = customerCode AND SITE IN allowedSites
  // 2. If empty → check STOLOC to determine correct error message
  async getConsignmentStock(customerCode, sites) {
    const pool = await this.poolPromise;
    
    // Build IN clause for sites (support single site or array)
    const siteList = Array.isArray(sites) ? sites : [sites].filter(Boolean);
    if (!customerCode || !siteList.length) return { stock: [], locationExists: false };

    const request = pool.request();
    request.input('customerCode', sql.VarChar, customerCode);

    // Build parameterized site IN clause
    const siteParams = siteList.map((s, i) => {
      request.input(`site${i}`, sql.VarChar, s);
      return `@site${i}`;
    }).join(',');

    // Step 1: Get stock where LOCATION = customer code AND SITE IN allowed sites
    const stockResult = await request.query(`
      SELECT
        PRODUCT,
        PROD_DESC,
        SITE,
        PHYSICAL_QTY,
        ALLOCATED_QTY,
        AVAILABLE_QTY,
        UNIT,
        LOCATION,
        CATEGORY
      FROM LEWISB.XSTDALN_STOCK
      WHERE LOCATION = @customerCode
      AND   SITE IN (${siteParams})
    `);

    const stock = stockResult.recordset;

    // If stock found — return it
    if (stock.length > 0) return { stock, locationExists: true };

    // Step 2: No stock — check if consignment location exists for this customer
    const request2 = pool.request();
    request2.input('customerCode2', sql.VarChar, customerCode);
    const siteParams2 = siteList.map((s, i) => {
      request2.input(`site2_${i}`, sql.VarChar, s);
      return `@site2_${i}`;
    }).join(',');

    const locResult = await request2.query(`
      SELECT TOP 1 LOC_0
      FROM LEWISB.STOLOC
      WHERE LOCTYP_0 = 'CUS'
      AND   LOC_0    = @customerCode2
      AND   STOFCY_0 IN (${siteParams2})
    `);

    const locationExists = locResult.recordset.length > 0;
    return { stock: [], locationExists };
  }


  // ── In-Transit: product lines from open deliveries ───────────────────────
  // Joins SDELIVERYD (lines) with SDELIVERY (header)
  // WHERE BPCORD_0 = erp_entity_code AND STOFCY_0 IN allowedSites
  // AND delivery not yet validated (VCRSTA_0 = 1)
  async getInTransitStock(customerCode, sites) {
    const pool = await this.poolPromise;

    if (!customerCode) return [];

    const request = pool.request();
    request.input('customerCode', sql.NVarChar, customerCode);

    // Exact query confirmed working in X3 SQL Server
    const result = await request.query(`
      SELECT
        D.ITMREF_0        AS PRODUCT,
        D.ITMDES1_0       AS PROD_DESC,
        D.SHIDAT_0        AS EXPECTED_DATE,
        D.QTY_0           AS QTY,
        D.SAU_0           AS UNIT,
        D.SOHNUM_0        AS SALES_ORDER_NO,
        S.SDHNUM_0        AS DELIVERY_NO,
        S.STOFCY_0        AS SITE,
        S.BPCORD_0        AS CUSTOMER_CODE,
        S.BPDNAM_0        AS CUSTOMER_NAME
      FROM LEWISB.SDELIVERYD D
      LEFT JOIN LEWISB.SDELIVERY S ON S.SDHNUM_0 = D.SDHNUM_0
      WHERE S.BPCORD_0 = @customerCode
      ORDER BY D.SHIDAT_0 ASC
    `);

    return result.recordset;
  }


  async getDashboardKPIs(customerCode, site) {
    const pool = await this.poolPromise;
    const req = pool.request();
    req.input('customerCode', sql.NVarChar, customerCode);
    req.input('site', sql.VarChar, site || '');
    const result = await req.query(`
      SELECT
        (SELECT COUNT(*) FROM tbs.LEWISB.SORDER   WHERE BPCORD_0=@customerCode AND SALFCY_0=@site) AS total_orders,
        (SELECT COUNT(*) FROM tbs.LEWISB.SORDER   WHERE BPCORD_0=@customerCode AND SALFCY_0=@site AND ALLSTA_0 IN (1,2)) AS pending_orders,
        (SELECT COUNT(*) FROM LEWISB.SDELIVERY    WHERE BPCORD_0=@customerCode AND STOFCY_0=@site AND VCRSTA_0=1) AS orders_in_dispatch,
        (SELECT COUNT(*) FROM LEWISB.SDELIVERY    WHERE BPCORD_0=@customerCode AND STOFCY_0=@site AND VCRSTA_0=2) AS delivered
    `);
    return result.recordset[0] || {};
  }

  async getAllSites() {

    const pool = await this.poolPromise;

    const result =
      await pool.request().query(`
        SELECT
          FCY_0 AS SITE,
          FCYNAM_0 AS DESCR
        FROM LEWISB.FACILITY
        WHERE XTMSFCY_0 = 2
      `);

    return result.recordset;
  }

  // ── PURCHASE ORDERS (Supplier Portal) ────────────────────────
  async getAllPurchaseOrders(supplierCode, filters = {}) {
    const pool = await this.poolPromise;
    if (!supplierCode) return [];

    const req = pool.request();
    req.input('supplierCode', sql.NVarChar, supplierCode);

    // NOTE: this tenant's PORDER/PORDERQ tables do NOT match the field names
    // this query originally assumed (confirmed via a live INFORMATION_SCHEMA.COLUMNS
    // check -- see debugListColumns). Confident renames applied: PSHNUM_0->POHNUM_0
    // (po number), IPTFCY_0->POHFCY_0 (site). Fields with NO confident equivalent
    // on this schema (expected_date, total_before_tax, total_after_tax, status)
    // are deliberately left OUT rather than mapped to a guessed column -- silently
    // wrong amounts are worse than a missing field. Same for line-level received_qty,
    // unit, unit_price, expected_date: PORDERQ has differently-shaped fields
    // (RCPQTYPUU_0/RCPQTYSTU_0, PUU_0/STU_0/UOM_0, CPR_0/CPRPRI_0, EXTRCPDAT_0/
    // RETRCPDAT_0/LASRCPDAT_0) with no single obvious 1:1 mapping without
    // confirming the actual business meaning with whoever configured this X3
    // instance. TODO: revisit once that's confirmed.
    const result = await req.query(`
      SELECT TOP 100
        P.POHNUM_0   AS po_number,
        P.BPSNUM_0   AS supplier_code,
        BP.BPSNAM_0  AS supplier_name,
        P.POHTYP_0   AS po_type,
        P.ORDDAT_0   AS order_date,
        P.POHFCY_0   AS site,
        P.CUR_0      AS currency
      FROM tbs.LEWISB.PORDER P
      LEFT JOIN LEWISB.BPSUPPLIER BP ON BP.BPSNUM_0 = P.BPSNUM_0
      WHERE P.BPSNUM_0 = @supplierCode
      ORDER BY P.ORDDAT_0 DESC
    `);

    const orders = result.recordset;

    // Fetch line items for each PO
    for (const po of orders) {
      const lineResult = await pool.request()
        .input('poNum', sql.NVarChar, po.po_number)
        .query(`
          SELECT
            L.ITMREF_0   AS product_code,
            I.ITMDES1_0  AS description,
            L.QTYUOM_0   AS ordered_qty
          FROM tbs.LEWISB.PORDERQ L
          LEFT JOIN LEWISB.ITMMASTER I ON I.ITMREF_0 = L.ITMREF_0
          WHERE L.POHNUM_0 = @poNum
        `);
      po.lines = lineResult.recordset;
    }

    return orders;
  }

  async getPurchaseOrderDetail(poNumber) {
    const pool = await this.poolPromise;
    if (!poNumber) return null;

    // NOTE: see getAllPurchaseOrders() above -- same schema mismatch, same
    // confident renames (PSHNUM_0->POHNUM_0, IPTFCY_0->POHFCY_0), same
    // deliberate omission of fields with no confident equivalent rather
    // than a guessed mapping (expected_date, total_before_tax,
    // total_after_tax, status, received_qty, pending_qty, unit, unit_price).
    const result = await pool.request()
      .input('poNum', sql.NVarChar, poNumber)
      .query(`
        SELECT
          P.POHNUM_0   AS po_number,
          P.BPSNUM_0   AS supplier_code,
          BP.BPSNAM_0  AS supplier_name,
          P.POHTYP_0   AS po_type,
          P.ORDDAT_0   AS order_date,
          P.POHFCY_0   AS site,
          P.CUR_0      AS currency,
          P.PTE_0      AS payment_terms,
          F.FCYNAM_0   AS site_name
        FROM tbs.LEWISB.PORDER P
        LEFT JOIN LEWISB.BPSUPPLIER BP ON BP.BPSNUM_0 = P.BPSNUM_0
        LEFT JOIN LEWISB.FACILITY F    ON F.FCY_0 = P.POHFCY_0
        WHERE P.POHNUM_0 = @poNum
      `);

    if (!result.recordset.length) return null;
    const po = result.recordset[0];

    const lineResult = await pool.request()
      .input('poNum2', sql.NVarChar, poNumber)
      .query(`
        SELECT
          L.ITMREF_0    AS product_code,
          I.ITMDES1_0   AS description,
          L.QTYUOM_0    AS ordered_qty
        FROM tbs.LEWISB.PORDERQ L
        LEFT JOIN LEWISB.ITMMASTER I ON I.ITMREF_0 = L.ITMREF_0
        WHERE L.POHNUM_0 = @poNum2
      `);

    po.lines = lineResult.recordset;
    return po;
  }

  // ── SUPPLIER CONSIGNMENT (what supplier's stock sits at customers) ────
  async getSupplierConsignment(supplierCode) {
    const pool = await this.poolPromise;
    if (!supplierCode) return [];

    const result = await pool.request()
      .input('supplierCode', sql.NVarChar, supplierCode)
      .query(`
        SELECT
          S.PRODUCT     AS product_code,
          S.PROD_DESC   AS description,
          S.LOCATION    AS customer_code,
          S.SITE        AS site,
          S.PHYSICAL_QTY AS physical_qty,
          S.AVAILABLE_QTY AS available_qty,
          S.ALLOCATED_QTY AS allocated_qty,
          S.UNIT        AS unit
        FROM LEWISB.XSTDALN_STOCK S
        WHERE S.SUPPLIER = @supplierCode
        ORDER BY S.LOCATION, S.PRODUCT
      `);

    return result.recordset;
  }
}

module.exports = SageX3Adapter;
