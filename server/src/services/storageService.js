const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads', 'admin-files');
const isS3 = Boolean(process.env.ENDPOINT);

let s3 = null;
let BUCKET = null;

if (isS3) {
    s3 = new S3Client({
        region: process.env.REGION || 'auto',
        endpoint: process.env.ENDPOINT,
        credentials: {
            accessKeyId: process.env.ACCESS_KEY_ID,
            secretAccessKey: process.env.SECRET_ACCESS_KEY,
        },
    });
    BUCKET = process.env.BUCKET;
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
