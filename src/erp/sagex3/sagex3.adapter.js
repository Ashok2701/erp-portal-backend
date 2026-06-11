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



  async resolveCustomerCode(req) {

    console.log("Inside resolveCustomerCode");
    console.log(req);

    const user = req.user || req;

    if (user.role === "Customer") {

      const userInfo =
        await UserModel.getUserById(
          user.user_id
        );

      console.log("inside customer");
      console.log(userInfo[0]);

      return userInfo[0].erp_entity_code;
    }

    if (user.role === "salesrep") {
      throw new Error(
        "customer_code is required for salesrep"
      );
    }

    return null;
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

    return result.recordset;
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
        BPAADD_0 AS address_code,
        BPADES_0 AS address_name,
        BPAADDLIG_0 AS address_line1,
        BPAADDLIG_1 AS address_line2,
        BPAADDLIG_2 AS address_line3,
        CTY_0 AS city,
        CRYNAM_0 AS country
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
        A.DLVDAT_0,
        A.SHIDAT_0,
        A.GROWEI_0,
        A.WEU_0,
        A.VOL_0,
        A.VOU_0,
        A.UPDDAT_0,
        A.UPDTIM_0,
        C.BPTNAM_0
      FROM LEWISB.SDELIVERY A
      LEFT JOIN tbs.LEWISB.BPCARRIER C
        ON A.BPTNUM_0 = C.BPTNUM_0
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
      ORDER BY A.DLVDAT_0 DESC
    `;

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
        A.SHIDAT_0,
        A.ALLSTA_0,
        A.INVSTA_0,
        A.UPDDAT_0,
        A.UPDTIM_0,
        C.BPTNAM_0,
        F.FCYDES_0 AS SITE_DESC,
        BP.BPCZIPCODE_0 AS DEL_ZIP,
        BP.BPCCTY_0 AS DEL_CITY
      FROM tbs.LEWISB.SORDER A
      LEFT JOIN tbs.LEWISB.BPCARRIER C
        ON A.BPTNUM_0 = C.BPTNUM_0
      LEFT JOIN tbs.LEWISB.FACILITY F
        ON A.SALFCY_0 = F.FCY_0
      LEFT JOIN tbs.LEWISB.BPCUSTOMER BP
        ON A.BPCORD_0 = BP.BPCNUM_0
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
          SELECT A.*,
            F.FCYDES_0 AS SITE_DESC,
            BP.BPCZIPCODE_0 AS DEL_ZIP,
            BP.BPCCTY_0 AS DEL_CITY
          FROM tbs.LEWISB.SORDER A
          LEFT JOIN tbs.LEWISB.FACILITY F ON A.SALFCY_0 = F.FCY_0
          LEFT JOIN tbs.LEWISB.BPCUSTOMER BP ON A.BPCORD_0 = BP.BPCNUM_0
          WHERE A.SOHNUM_0=@orderNo
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
            C.NETPRIATI_0
          FROM tbs.LEWISB.SORDERQ A
          LEFT JOIN tbs.LEWISB.SORDERP C
            ON A.SOHNUM_0 = C.SOHNUM_0
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
        A.FCY_0
      FROM tbs.LEWISB.SINVOICE A
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
      WHERE 1=1
    `;

    const request =
      pool.request();

    // Dynamic site filter — replaces hardcoded site
    if (filters.site) {
      query += ` AND SITE = @site`;
      request.input("site", sql.VarChar, filters.site);
    }

    if (filters.product) {
      query += ` AND (PRODUCT LIKE @product OR PROD_DESC LIKE @product)`;
      request.input("product", sql.VarChar, `%${filters.product}%`);
    }

    if (filters.warehouse) {

      query += `
        AND LOCATION = @warehouse
      `;

      request.input(
        "warehouse",
        sql.VarChar,
        filters.warehouse
      );
    }

    if (filters.category) {

      query += `
        AND CATEGORY = @category
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
}

module.exports = SageX3Adapter;