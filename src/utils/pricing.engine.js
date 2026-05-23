exports.resolvePrice =
  ({
    product,
    customer,
    pricingRules
  }) => {

    // 1. Customer + Product
    let rule =
      pricingRules.find(r =>

        r.BPCNUM_0 === customer &&

        r.ITMREF_0 ===
        product.PROD_CODE
      );

    if (rule) {

      return {

        price: rule.PRI_0,

        source:
          "CUSTOMER_PRODUCT"
      };
    }

    // 2. Customer + Category
    rule =
      pricingRules.find(r =>

        r.BPCNUM_0 === customer &&

        r.TCLCOD_0 ===
        product.CATEGORY
      );

    if (rule) {

      return {

        price: rule.PRI_0,

        source:
          "CUSTOMER_CATEGORY"
      };
    }

    // 3. Product
    rule =
      pricingRules.find(r =>

        !r.BPCNUM_0 &&

        r.ITMREF_0 ===
        product.PROD_CODE
      );

    if (rule) {

      return {

        price: rule.PRI_0,

        source:
          "PRODUCT"
      };
    }

    // 4. Category
    rule =
      pricingRules.find(r =>

        !r.BPCNUM_0 &&

        r.TCLCOD_0 ===
        product.CATEGORY
      );

    if (rule) {

      return {

        price: rule.PRI_0,

        source:
          "CATEGORY"
      };
    }

    // 5. Default
    return {

      price: 0,

      source: "DEFAULT"
    };
};