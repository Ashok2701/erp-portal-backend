"use strict";
const db = require("../config/db");

const VALID_MODES = ["saas", "onpremise"];

/**
 * Get current deployment mode.
 * Priority: DB → ENV → default 'saas'
 */
exports.getDeploymentMode = async () => {
  try {
    const r = await db.query(
      "SELECT value FROM system_config WHERE key = 'deployment_mode' LIMIT 1"
    );
    if (r.rows.length && VALID_MODES.includes(r.rows[0].value)) {
      return r.rows[0].value;
    }
  } catch (_) {}
  return process.env.DEPLOYMENT_MODE || "saas";
};

/**
 * Set deployment mode (Owner only — called from API).
 */
exports.setDeploymentMode = async (mode) => {
  if (!VALID_MODES.includes(mode))
    throw new Error(`Invalid mode: ${mode}. Must be 'saas' or 'onpremise'`);

  await db.query(
    `INSERT INTO system_config (key, value, updated_at)
     VALUES ('deployment_mode', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [mode]
  );
  return mode;
};

/**
 * Quick boolean checks
 */
exports.isOnPremise = async () => {
  const mode = await exports.getDeploymentMode();
  return mode === "onpremise";
};

exports.isSaaS = async () => {
  const mode = await exports.getDeploymentMode();
  return mode === "saas";
};
