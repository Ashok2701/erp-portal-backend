const soap = require("soap");
const https = require("https");

let cachedClient = null;

const wsdlUrl = process.env.X3_SOAP_URL
 //+ "/soap-wsdl/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC?wsdl";

async function getSoapClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const client = await soap.createClientAsync(wsdlUrl, {
    attributesKey: "attributes",
    valueKey: "$value",
    xmlKey: "$xml",
    wsdl_options: {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    },
  });

  client.setSecurity(new soap.BasicAuthSecurity(
    process.env.X3_USERNAME,
    process.env.X3_PASSWORD
  ));

  cachedClient = client;
  return client;
}

module.exports = { getSoapClient };
