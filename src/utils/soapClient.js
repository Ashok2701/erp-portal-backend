"use strict";
const soap  = require("soap");
const https = require("https");

// Per-tenant SOAP client cache
const clients = {};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Get SOAP client for a tenant.
 * settings = tenant_settings row (has x3_wsdl_url, x3_soap_url, x3_username, x3_password)
 */
async function getSoapClient(settings) {
  const key = settings.tenant_id || "default";
  if (clients[key]) return clients[key];

  const wsdlUrl = settings.x3_wsdl_url || process.env.X3_WSDL_URL;
  const soapUrl = settings.x3_soap_url || process.env.X3_SOAP_URL;
  const username = settings.x3_username || process.env.X3_USERNAME;
  const password = settings.x3_password || process.env.X3_PASSWORD;

  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  const client = await soap.createClientAsync(wsdlUrl, {
    endpoint: soapUrl,
    wsdl_options: { agent: httpsAgent, rejectUnauthorized: false, strictSSL: false },
    attributesKey: "attributes",
    valueKey: "$value",
    xmlKey: "$xml",
  });

  client.setEndpoint(soapUrl);
  client.setSecurity(new soap.BasicAuthSecurity(username, password));

  console.log(`✅ SOAP client initialized for tenant: ${key}`);
  clients[key] = client;
  return client;
}

// Legacy export — used by existing code, falls back to env vars
async function getSoapClientLegacy() {
  return getSoapClient({
    tenant_id:   "default",
    x3_wsdl_url: process.env.X3_WSDL_URL,
    x3_soap_url: process.env.X3_SOAP_URL,
    x3_username: process.env.X3_USERNAME,
    x3_password: process.env.X3_PASSWORD,
  });
}

exports.getSoapClient         = getSoapClientLegacy; // legacy
exports.getSoapClientForTenant = getSoapClient;       // new multi-tenant
exports.clearSoapCache = (tenantId) => {
  if (tenantId) delete clients[tenantId];
  else Object.keys(clients).forEach(k => delete clients[k]);
};
