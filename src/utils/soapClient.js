const soap = require("soap");
const https = require("https");

let cachedClient = null;

// DEV ONLY
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const wsdlUrl =
  process.env.X3_WSDL_URL ||
  "https://tmsx3em.tema-systems.com/soap-wsdl/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC?wsdl";

async function getSoapClient() {

  try {

    if (cachedClient) {
      return cachedClient;
    }

    // HTTPS AGENT
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    // CREATE SOAP CLIENT
    const client = await soap.createClientAsync(
      wsdlUrl,
      {
        endpoint: process.env.X3_SOAP_URL,

        wsdl_options: {
          rejectUnauthorized: false,
          strictSSL: false,
          forever: true,
        },

        attributesKey: "attributes",
        valueKey: "$value",
        xmlKey: "$xml",
      }
    );

    // FORCE HTTPS AGENT
    client.setSecurity(
      new soap.BasicAuthSecurity(
        process.env.X3_USERNAME,
        process.env.X3_PASSWORD,
        {
          rejectUnauthorized: false,
          strictSSL: false,
          secureOptions: https.constants.SSL_OP_NO_TLSv1_2,
          agent: httpsAgent,
        }
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