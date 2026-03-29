const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");

const s3 = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: "us-east-1", // IMPORTANT for DO
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.SPACES_BUCKET,
    acl: "public-read",
    key: (req, file, cb) => {
      const folder = "content"; // you can change
      const fileName = `${folder}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

module.exports = upload;