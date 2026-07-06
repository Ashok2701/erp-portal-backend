"use strict";
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const multer    = require("multer");
const multerS3  = require("multer-s3");
const db        = require("../config/db");

function getS3() {
  return new S3Client({
    endpoint:    process.env.SPACES_ENDPOINT,
    region:      process.env.SPACES_REGION || "us-east-1",
    credentials: {
      accessKeyId:     process.env.SPACES_KEY,
      secretAccessKey: process.env.SPACES_SECRET,
    },
    forcePathStyle: false,
  });
}

/**
 * Resolves the storage path prefix for a request.
 *
 * New 3-tier folder hierarchy:
 *   owner/                        → platform-level files (branding, docs)
 *   partners/{partner-slug}/      → partner-level files
 *   tenants/{tenant-slug}/        → tenant-level files (default)
 *
 * Falls back to legacy flat path (tenant_slug) for backward compat.
 */
async function resolveStoragePrefix(req) {
  const { system_role, tenant_slug, partner_id, is_super_admin } = req.user || {};

  // Owner
  if (system_role === "owner" || is_super_admin) {
    return "owner";
  }

  // Partner user
  if (system_role === "partner_user" && partner_id) {
    try {
      const r = await db.query(
        "SELECT slug FROM partners WHERE partner_id=$1 LIMIT 1",
        [partner_id]
      );
      const slug = r.rows[0]?.slug || "partner";
      return `partners/${slug}`;
    } catch (_) {
      return "partners/unknown";
    }
  }

  // Tenant user — default path
  const slug = req.user?.tenant_slug || req.tenantSlug || "temaglobal";
  return `tenants/${slug}`;
}

/**
 * Creates a multer-s3 upload middleware.
 *
 * Files are stored under:
 *   {prefix}/{subFolder}/{timestamp}-{filename}
 *
 * Examples:
 *   tenants/temaglobal/legaldocs/1234567890_contract.pdf
 *   partners/asian-solutions/branding/1234567890_logo.png
 *   owner/platform-docs/1234567890_tos.pdf
 */
function createUpload(subFolder = "content", options = {}) {
  return multer({
    storage: multerS3({
      s3:     getS3(),
      bucket: process.env.SPACES_BUCKET,
      acl:    options.acl || "public-read",
      key: async (req, file, cb) => {
        try {
          const prefix   = await resolveStoragePrefix(req);
          const safeName = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
          const key      = `${prefix}/${subFolder}/${Date.now()}_${safeName}`;
          cb(null, key);
        } catch (err) {
          cb(err);
        }
      },
    }),
    limits: { fileSize: options.maxSize || 20 * 1024 * 1024 },
    fileFilter: options.pdfOnly
      ? (_req, file, cb) => {
          if (file.mimetype === "application/pdf") cb(null, true);
          else cb(new Error("Only PDF files are allowed"));
        }
      : undefined,
  });
}

/**
 * Delete a file from Spaces by its key.
 */
async function deleteFromSpaces(key) {
  const s3 = getS3();
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key:    key,
  }));
}

/**
 * Get the public URL for a Spaces key.
 */
function getSpacesUrl(key) {
  const bucket   = process.env.SPACES_BUCKET;
  const endpoint = (process.env.SPACES_ENDPOINT || "").replace("https://", "");
  return `https://${bucket}.${endpoint}/${key}`;
}

// Default export — general content upload (public-read)
// Guard: if Spaces env vars not configured, export a no-op to prevent startup crash
let upload;
if (process.env.SPACES_BUCKET && process.env.SPACES_KEY && process.env.SPACES_SECRET) {
  upload = createUpload("content");
} else {
  // No-op middleware when Spaces not configured (dev/test environment)
  const multer = require("multer");
  upload = multer({ storage: multer.memoryStorage() });
  console.warn("[uploadSpaces] SPACES env vars not set — using memory storage fallback");
}
module.exports = upload;
module.exports.createUpload      = createUpload;
module.exports.deleteFromSpaces  = deleteFromSpaces;
module.exports.getSpacesUrl      = getSpacesUrl;
module.exports.resolveStoragePrefix = resolveStoragePrefix;
