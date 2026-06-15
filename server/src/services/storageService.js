const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

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

module.exports = { upload, download, remove, removeBatch };
