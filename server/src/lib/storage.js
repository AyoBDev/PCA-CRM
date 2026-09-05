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

// Remove a stored object. Safe to call for a key that no longer exists — the
// point is that the DB row and the bytes disappear together, so a delete must
// never fail just because the file was already gone. Callers guard their own
// DB delete; this is best-effort on the storage side.
async function deleteFile(key) {
  // Never let an empty key resolve to the uploads root (path.join would).
  if (!key || typeof key !== 'string') return;
  if (isS3) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } else {
    const filePath = path.join(LOCAL_DIR, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// Enumerate stored objects under a prefix, with the last-modified time of
// each. Used by maintenance tooling that compares what is stored against what
// the DB still references, so this MUST be exhaustive — an S3 page that is
// silently dropped would make the keys on it look unreferenced.
//
// mtimeMs is null when the backend doesn't report one. Callers that use it to
// decide whether a file is safe to delete must treat null as "unknown" and
// skip the file, never as "old enough to collect".
//
// Returns POSIX-style keys in both modes.
async function listObjects(prefix = '') {
  if (isS3) {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const out = [];
    let token;
    do {
      const res = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }));
      for (const obj of res.Contents || []) {
        if (!obj.Key) continue;
        const t = obj.LastModified ? new Date(obj.LastModified).getTime() : NaN;
        out.push({ key: obj.Key, mtimeMs: Number.isFinite(t) ? t : null });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  const root = path.join(LOCAL_DIR, prefix);
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        let mtimeMs = null;
        try { mtimeMs = fs.statSync(full).mtimeMs; } catch { mtimeMs = null; }
        // Key is the path relative to the uploads root, POSIX-separated so it
        // compares equal to the keys stored in the DB on any platform.
        out.push({ key: path.relative(LOCAL_DIR, full).split(path.sep).join('/'), mtimeMs });
      }
    }
  };
  walk(root);
  return out;
}

// Key-only view of listObjects, for callers that don't care about timestamps.
async function listKeys(prefix = '') {
  return (await listObjects(prefix)).map((o) => o.key);
}

module.exports = { uploadFile, getPresignedUrl, downloadFile, deleteFile, listKeys, listObjects };
