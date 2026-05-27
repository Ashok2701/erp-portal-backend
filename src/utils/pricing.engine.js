// src/engines/pricing.engine.js

// ======================================================
// BUILD PRICING INDEX
// ======================================================

exports.buildPricingIndex = (pricingRows) => {

  const index = {

    // -----------------------------------
    // Customer + Product Price
    // key:
    // CUSTOMER_PRODUCT
    // -----------------------------------

    T20: {},

    // -----------------------------------
    // Customer + Product Discount
    // key:
    // CUSTOMER_PRODUCT
    // -----------------------------------

    T21: {},

    // -----------------------------------
    // Product Base Price
    // key:
    // PRODUCT
    // -----------------------------------

    T10: {},

    // -----------------------------------
    // Quantity Pricing
    // key:
    // PRODUCT
    // value:
    // array of qty rules
    // -----------------------------------

    T11: {}
  };

  pricingRows.forEach(row => {

    // ===================================
    // T20
    // Customer + Product Price
    // ===================================

    if (row.PLI_0 === "T20") {

      const key =
        `${row.PLICRI_0}_${row.PLICRI1_0}`;

      index.T20[key] = row;
    }

    // ===================================
    // T21
    // Customer + Product Discount
    // ===================================

    else if (row.PLI_0 === "T21") {

      const key =
        `${row.PLICRI_0}_${row.PLICRI1_0}`;

      index.T21[key] = row;
    }

    // ===================================
    // T10
    // Product Price
    // ===================================

    else if (row.PLI_0 === "T10") {

      index.T10[
        row.PLICRI_0
      ] = row;
    }

    // ===================================
    // T11
    // Quantity Pricing
    // ===================================

    else if (row.PLI_0 === "T11") {

      const product =
        row.PLICRI_0;

      if (!index.T11[product]) {

        index.T11[product] = [];
      }

      index.T11[product].push(row);
    }
  });

  return index;
};


// ======================================================
// FIND BASE PRICE
// ======================================================

function findBasePrice({

  product,

  customer,

  quantity,

  pricingIndex

}) {

  // ===================================
  // T20
  // Customer + Product
  // ===================================

  const customerKey =
    `${customer}_${product.PROD_CODE}`;

  let rule =
    pricingIndex.T20[
      customerKey
    ];

  if (rule) {

    return {

      price:
        Number(rule.PRI_0 || 0),

      source:
        "T20"
    };
  }

  // ===================================
  // T11
  // Quantity Pricing
  // ===================================

  const qtyRules =
    pricingIndex.T11[
      product.PROD_CODE
    ] || [];

  rule =
    qtyRules.find(r =>

      quantity >=
        Number(r.MINQTY_0 || 0)

      &&

      quantity <=
        Number(r.MAXQTY_0 || 999999)
    );

  if (rule) {

    return {

      price:
        Number(rule.PRI_0 || 0),

      source:
        "T11"
    };
  }

  // ===================================
  // T10
  // Product Price
  // ===================================

  rule =
    pricingIndex.T10[
      product.PROD_CODE
    ];

  if (rule) {

    return {

      price:
        Number(rule.PRI_0 || 0),

      source:
        "T10"
    };
  }

  // ===================================
  // Product Master Price
  // ===================================

  if (product.BASE_PRICE) {

    return {

      price:
        Number(product.BASE_PRICE || 0),

      source:
        "PRODUCT_MASTER"
    };
  }

  // ===================================
  // No Price Found
  // ===================================

  return {

    price: 0,

    source: "NONE"
  };
}


// ======================================================
// APPLY DISCOUNTS
// ======================================================

function applyDiscounts({

  basePrice,

  product,

  customer,

  pricingIndex

}) {

  let discount = 0;

  // ===================================
  // T21
  // Customer + Product Discount
  // ===================================

  const discountKey =
    `${customer}_${product.PROD_CODE}`;

  const t21 =
    pricingIndex.T21[
      discountKey
    ];

  if (t21) {

    discount +=
      Number(t21.DCGVAL_0 || 0);
  }

  // ===================================
  // Final Price
  // ===================================

  const finalPrice =

    basePrice -

    (
      basePrice *
      discount / 100
    );

  return {

    discount,

    finalPrice
  };
}


// ======================================================
// MAIN RESOLVER
// ======================================================

exports.resolvePrice = ({

  product,

  customer,

  quantity = 1,

  pricingIndex

}) => {

  // ===================================
  // Base Price
  // ===================================

  const base =
    findBasePrice({

      product,

      customer,

      quantity,

      pricingIndex
    });

  // ===================================
  // Discounts
  // ===================================

  const discountResult =
    applyDiscounts({

      basePrice:
        base.price,

      product,

      customer,

      pricingIndex
    });

  // ===================================
  // Final Result
  // ===================================

  return {

    basePrice:
      base.price,

    discount:
      discountResult.discount,

    finalPrice:
      discountResult.finalPrice,

    source:
      base.source
  };
};