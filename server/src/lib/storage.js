const fs = require('fs');
const path = require('path');

// Keys already carry their own prefix (e.g. "certs/<id>/..."), so LOCAL_DIR is
// the uploads root — joining with the key yields server/uploads/certs/... (no doubling).
const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads');

const isS3 = Boolean(process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT);

let s3 = null;
let BUCKET = null;

if (isS3) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY || '',
      secretAccessKey: process.env.RAILWAY_OBJECT_STORAGE_SECRET_KEY || '',
    },
    forcePathStyle: true,
  });
  BUCKET = process.env.RAILWAY_BUCKET_NAME || 'nvbestpca-files';
}

async function uploadFile(key, buffer, contentType) {
  if (isS3) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  } else {
    const filePath = path.join(LOCAL_DIR, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }
  return key;
}

async function getPresignedUrl(key, expiresIn = 300) {
  if (isS3) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(s3, command, { expiresIn });
  } else {
    return 'file://' + path.join(LOCAL_DIR, key);
  }
}

module.exports = { uploadFile, getPresignedUrl };
