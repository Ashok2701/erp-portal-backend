"use strict";
const logger = require("../utils/logger");

/**
 * Global async error wrapper.
 * Wraps any async route handler so unhandled promise rejections
 * are caught and forwarded to the global error handler.
 *
 * Usage: router.get("/", asyncHandler(ctrl.list));
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Global error handler — must be registered LAST in app.js.
 * Catches anything passed to next(err) or thrown in asyncHandler.
 */
const globalErrorHandler = (err, req, res, _next) => {
  // Known business errors
  if (err.code === "ERP_NOT_CONFIGURED") {
    return res.status(503).json({
      success: false,
      code:    "ERP_NOT_CONFIGURED",
      message: err.message,
    });
  }

  // Validation errors from Joi middleware
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      code:    "VALIDATION_ERROR",
      message: err.details?.map(d => d.message).join("; ") || err.message,
    });
  }

  // Postgres unique violation
  if (err.code === "23505") {
    return res.status(409).json({
      success: false,
      code:    "DUPLICATE_KEY",
      message: "A record with that value already exists.",
    });
  }

  // Postgres FK violation
  if (err.code === "23503") {
    return res.status(400).json({
      success: false,
      code:    "FOREIGN_KEY",
      message: "Referenced record does not exist.",
    });
  }

  // CORS error
  if (err.message?.startsWith("CORS:")) {
    return res.status(403).json({ success: false, message: err.message });
  }

  // Multer file size
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "File too large." });
  }

  // Default 500
  const reqId = req.headers["x-request-id"] || "—";
  logger.error("Unhandled error", {
    reqId,
    method:  req.method,
    path:    req.path,
    message: err.message,
    stack:   err.stack,
  });

  res.status(500).json({
    success: false,
    code:    "INTERNAL_ERROR",
    message: process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please try again."
      : err.message,
  });
};

/**
 * 404 handler — register before globalErrorHandler.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    code:    "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
};

module.exports = { asyncHandler, globalErrorHandler, notFoundHandler };
