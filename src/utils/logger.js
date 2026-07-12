"use strict";

/**
 * Lightweight structured logger.
 * Outputs JSON lines in production, coloured text in dev.
 * Usage: const logger = require('./logger'); logger.info('msg', { key: val });
 */

const IS_PROD = process.env.NODE_ENV === "production";
const IS_TEST = process.env.NODE_ENV === "test";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? (IS_PROD ? LEVELS.info : LEVELS.debug);

const COLOURS = { error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[36m", debug: "\x1b[90m", reset: "\x1b[0m" };

function log(level, message, meta = {}) {
  if (IS_TEST) return;
  if (LEVELS[level] > MIN_LEVEL) return;

  const entry = {
    ts:      new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === "object" ? meta : { data: meta }),
  };

  if (IS_PROD) {
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const c = COLOURS[level] || "";
    const r = COLOURS.reset;
    const metaStr = Object.keys(entry).filter(k => !["ts","level","message"].includes(k)).length
      ? " " + JSON.stringify(meta)
      : "";
    console.log(`${c}[${level.toUpperCase()}]${r} ${message}${metaStr}`);
  }
}

const logger = {
  error: (msg, meta) => log("error", msg, meta),
  warn:  (msg, meta) => log("warn",  msg, meta),
  info:  (msg, meta) => log("info",  msg, meta),
  debug: (msg, meta) => log("debug", msg, meta),
};

module.exports = logger;
