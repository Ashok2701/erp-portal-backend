function findBasePrice({
  product,
  customer,
  quantity,
  pricing
}) {

  // ---------------------------------
  // T20 Customer + Product
  // ---------------------------------

  let rule =
    pricing.find(p =>

      p.PLI_0 === "T20"

      &&

      p.PLICRI_0 === customer

      &&

      p.PLICRI1_0 ===
        product.PROD_CODE
    );

  if (rule) {

    return {

      price: rule.PRI_0,

      source: "T20"
    };
  }

  // ---------------------------------
  // T11 Qty Pricing
  // ---------------------------------

  rule =
    pricing.find(p =>

      p.PLI_0 === "T11"

      &&

      p.PLICRI_0 ===
        product.PROD_CODE

      &&

      quantity >=
        p.MINQTY_0

      &&

      quantity <=
        p.MAXQTY_0
    );

  if (rule) {

    return {

      price: rule.PRI_0,

      source: "T11"
    };
  }

  // ---------------------------------
  // T10 Product Price
  // ---------------------------------

  rule =
    pricing.find(p =>

      p.PLI_0 === "T10"

      &&

      p.PLICRI_0 ===
        product.PROD_CODE
    );

  if (rule) {

    return {

      price: rule.PRI_0,

      source: "T10"
    };
  }

  // ---------------------------------
  // Product Master Price
  // ---------------------------------

  if (product.BASE_PRICE) {

    return {

      price:
        product.BASE_PRICE,

      source:
        "PRODUCT_MASTER"
    };
  }

  return {

    price: 0,

    source: "NONE"
  };
}


function applyDiscounts({
  basePrice,
  product,
  customer,
  pricing
}) {

  let discount = 0;

  // ---------------------------------
  // T21 Discount
  // ---------------------------------

  const t21 =
    pricing.find(p =>

      p.PLI_0 === "T21"

      &&

      p.PLICRI_0 === customer

      &&

      p.PLICRI1_0 ===
        product.PROD_CODE
    );

  if (t21) {

    discount +=
      t21.DCGVAL_0 || 0;
  }

  // ---------------------------------
  // Final Price
  // ---------------------------------

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


exports.resolvePrice = ({
  product,
  customer,
  quantity,
  pricing
}) => {

  const base =
    findBasePrice({

      product,

      customer,

      quantity,

      pricing
    });

  const discountResult =
    applyDiscounts({

      basePrice:
        base.price,

      product,

      customer,

      pricing
    });

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