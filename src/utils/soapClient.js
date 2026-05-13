const soap = require("soap");
const https = require("https");
const axios = require("axios");

let cachedClient = null;

// IMPORTANT
// Use WSDL URL here
const wsdlUrl =
  process.env.X3_WSDL_URL ||
  "https://tmsx3em.tema-systems.com/soap-wsdl/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC?wsdl";

// Disable SSL verification (DEV ONLY)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function getSoapClient() {
  try {
    if (cachedClient) {
      return cachedClient;
    }

    // HTTPS Agent
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    // Create SOAP Client
    const client = await soap.createClientAsync(wsdlUrl, {
      endpoint: process.env.X3_SOAP_URL,

      attributesKey: "attributes",
      valueKey: "$value",
      xmlKey: "$xml",

      wsdl_options: {
        httpsAgent,
        rejectUnauthorized: false,
        strictSSL: false,
      },

      request: (options, callback) => {
        options.httpsAgent = httpsAgent;
        options.rejectUnauthorized = false;

        axios({
          ...options,
          httpsAgent,
        })
          .then((response) => {
            callback(null, response, response.data);
          })
          .catch((error) => {
            callback(error);
          });
      },
    });

    // Basic Authentication
    client.setSecurity(
      new soap.BasicAuthSecurity(
        process.env.X3_USERNAME,
        process.env.X3_PASSWORD
      )
    );

    // DEBUG LOGGING
    client.on("request", (xml) => {
      console.log("========== SOAP REQUEST ==========");
      console.log(xml);
    });

    client.on("response", (xml) => {
      console.log("========== SOAP RESPONSE ==========");
      console.log(xml);
    });

    cachedClient = client;

    console.log("SOAP Client Initialized");

    return client;
  } catch (error) {
    console.error("SOAP CLIENT ERROR:", error);
    throw error;
  }
}

module.exports = {
  getSoapClient,
};