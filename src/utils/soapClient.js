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

    // BASIC AUTH
    client.setSecurity(
      new soap.BasicAuthSecurity(
        process.env.X3_USERNAME,
        process.env.X3_PASSWORD
      )
    );

    // FORCE AGENT
    client.httpClient._request = function (url, data, callback, exheaders, exoptions) {

      const options = {
        ...exoptions,
        httpsAgent,
        rejectUnauthorized: false,
      };

      return this.request(url, data, callback, exheaders, options);
    };

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