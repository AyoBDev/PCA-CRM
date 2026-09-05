const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { getAgencyId } = require('../lib/tenantContext');

const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads', 'admin-files');

// Railway injects bucket vars — support all naming conventions
const endpoint = process.env.AWS_ENDPOINT_URL || process.env.ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || '';
const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.BUCKET || process.env.BUCKET_NAME || '';
const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || '';
const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || '';
const region = process.env.AWS_DEFAULT_REGION || process.env.REGION || process.env.AWS_REGION || 'auto';

const isS3 = Boolean(endpoint);

let s3 = null;
let BUCKET = null;

if (isS3) {
    s3 = new S3Client({
        region,
        endpoint,
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
        },
    });
    BUCKET = bucket;
    console.log(`[Storage] S3 mode — endpoint: ${endpoint}, bucket: ${bucket}`);
} else {
    console.log('[Storage] Local filesystem mode — no ENDPOINT env var detected');
}

function tenantKey(key) {
    const agencyId = getAgencyId();
    return agencyId ? `agency/${agencyId}/${key}` : key;
}

async function upload(key, buffer, contentType) {
    if (isS3) {
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
    } else {
        const filePath = path.join(LOCAL_DIR, key);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);
    }
}

async function download(key) {
    if (isS3) {
        const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        return res.Body;
    } else {
        const filePath = path.join(LOCAL_DIR, key);
        if (!fs.existsSync(filePath)) return null;
        return fs.createReadStream(filePath);
    }
}

async function remove(key) {
    if (isS3) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } else {
        const filePath = path.join(LOCAL_DIR, key);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}

async function removeBatch(keys) {
    if (!keys.length) return;
    if (isS3) {
        await s3.send(new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: keys.map(Key => ({ Key })) },
        }));
    } else {
        for (const key of keys) {
            const filePath = path.join(LOCAL_DIR, key);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
}

// Enumerate stored objects under a prefix, with the last-modified time of
// each. Used by maintenance tooling that compares what is stored against what
// the DB still references, so this MUST be exhaustive — a dropped S3 page
// would make the keys on it look unreferenced.
//
// mtimeMs is null when the backend doesn't report one. Callers that use it to
// decide whether a file is safe to delete must treat null as "unknown" and
// skip the file, never as "old enough to collect".
//
// Keys come back relative to LOCAL_DIR (the admin-files root), matching the
// shape stored in admin_files.storage_key.
async function listObjects(prefix = '') {
    if (isS3) {
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

module.exports = { tenantKey, upload, download, remove, removeBatch, listKeys, listObjects };
