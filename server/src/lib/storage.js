const fs = require('fs');
const path = require('path');

// Keys already carry their own prefix (e.g. "certs/<id>/..."), so LOCAL_DIR is
// the uploads root — joining with the key yields server/uploads/certs/... (no doubling).
const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads');

// Accept BOTH the RAILWAY_OBJECT_STORAGE_* vars (used by the one-off cert import)
// AND the AWS_*/generic vars that Railway auto-injects when a bucket is connected
// (the same set the admin file manager's storageService.js reads). Preferring the
// explicit RAILWAY_* names but falling back to the auto-injected ones means cert
// downloads reach the bucket on the deployed server without any extra Railway
// config — previously this module only read RAILWAY_OBJECT_STORAGE_*, which Railway
// does NOT auto-inject, so on prod isS3 was false and it fell back to local disk.
const endpoint = process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT
  || process.env.AWS_ENDPOINT_URL || process.env.ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || '';
const accessKey = process.env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY
  || process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || '';
const secretKey = process.env.RAILWAY_OBJECT_STORAGE_SECRET_KEY
  || process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || '';
const region = process.env.AWS_DEFAULT_REGION || process.env.REGION || process.env.AWS_REGION || 'auto';

const isS3 = Boolean(endpoint);

let s3 = null;
let BUCKET = null;

if (isS3) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });
  BUCKET = process.env.RAILWAY_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME
    || process.env.BUCKET || process.env.BUCKET_NAME || 'nvbestpca-files';
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

// Fetch a stored object's bytes as a Buffer. Returns null if the key does not
// exist. Used to stream cert files that live only in the bucket (no inline
// fileData) back through the authenticated download route.
async function downloadFile(key) {
  if (isS3) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return null;
      throw err;
    }
  } else {
    const filePath = path.join(LOCAL_DIR, key);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }
}

module.exports = { uploadFile, getPresignedUrl, downloadFile };
