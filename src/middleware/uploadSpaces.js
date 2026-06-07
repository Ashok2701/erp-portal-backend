"use strict";
const { S3Client } = require("@aws-sdk/client-s3");
const multer       = require("multer");
const multerS3     = require("multer-s3");

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
 * Creates a multer-s3 upload middleware.
 * Files are stored under:  {tenantSlug}/{subFolder}/{timestamp}-{filename}
 *
 * tenantSlug is read from req.user.tenant_slug (set by auth middleware)
 * Falls back to 'temaglobal' if not set.
 */
function createUpload(subFolder = "content", options = {}) {
  return multer({
    storage: multerS3({
      s3:     getS3(),
      bucket: process.env.SPACES_BUCKET,
      acl:    options.acl || "public-read",
      key: (req, file, cb) => {
        const slug     = req.user?.tenant_slug || req.tenantSlug || "temaglobal";
        const safeName = file.originalname.replace(/\s+/g, "_");
        const key      = `${slug}/${subFolder}/${Date.now()}_${safeName}`;
        cb(null, key);
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

// Default export — general content upload (public-read)
const upload = createUpload("content");
module.exports = upload;
module.exports.createUpload = createUpload;
