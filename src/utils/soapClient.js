const soap = require("soap");
const https = require("https");

let cachedClient = null;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const wsdlUrl = process.env.X3_WSDL_URL;

async function getSoapClient() {

  try {

    if (cachedClient) {
      return cachedClient;
    }

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    const client = await soap.createClientAsync(
      wsdlUrl,
      {
        endpoint: process.env.X3_SOAP_URL,

        wsdl_options: {
          agent: httpsAgent,
          rejectUnauthorized: false,
          strictSSL: false,
        },

        attributesKey: "attributes",
        valueKey: "$value",
        xmlKey: "$xml",
      }
    );

    // IMPORTANT
    // Force SOAP endpoint manually
    client.setEndpoint(process.env.X3_SOAP_URL);

    client.setSecurity(
      new soap.BasicAuthSecurity(
        process.env.X3_USERNAME,
        process.env.X3_PASSWORD
      )
    );

    console.log("SOAP CLIENT INITIALIZED");

    cachedClient = client;

    return client;

  } catch (error) {

    console.error("SOAP CLIENT ERROR:", error);

    throw error;
  }
}

module.exports = {
  getSoapClient,
};