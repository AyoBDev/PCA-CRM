const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads', 'admin-files');
const isS3 = Boolean(process.env.STORAGE_ENDPOINT);

let s3 = null;
let BUCKET = null;

if (isS3) {
    s3 = new S3Client({
        region: process.env.STORAGE_REGION || 'auto',
        endpoint: process.env.STORAGE_ENDPOINT,
        credentials: {
            accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
            secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
    });
    BUCKET = process.env.STORAGE_BUCKET;
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
