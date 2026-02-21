const soap = require("soap");

exports.createSalesOrder = async (erpConn, orderData) => {
  const client = await soap.createClientAsync(erpConn.soap_wsdl_url);

  client.setSecurity(
    new soap.BasicAuthSecurity(
      erpConn.api_username,
      erpConn.api_password
    )
  );

  const [result] = await client.createSalesOrderAsync({
    CustomerCode: orderData.customer_code,
    Lines: orderData.items,
    Address: orderData.address
  });

  return result;
};
