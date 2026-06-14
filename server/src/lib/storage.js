const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY || '',
    secretAccessKey: process.env.RAILWAY_OBJECT_STORAGE_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.RAILWAY_BUCKET_NAME || 'nvbestpca-files';

async function uploadFile(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

async function getPresignedUrl(key, expiresIn = 300) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

module.exports = { uploadFile, getPresignedUrl };
