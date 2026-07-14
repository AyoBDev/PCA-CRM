'use strict';

const fs = require('fs');
const path = require('path');

// LOCAL_DIR as defined in storage.js: path.join(__dirname, '..', '..', 'uploads')
// storage.js __dirname = server/src/lib → LOCAL_DIR = server/uploads
// The key carries its own 'certs/' prefix, so a write lands at server/uploads/certs/...
// From this test file: server/src/lib/__tests__ → go up 3 to reach server/ → uploads
const LOCAL_DIR = path.join(
  __dirname,            // server/src/lib/__tests__
  '..', '..', '..', // up to server/
  'uploads'
);

const TEST_KEY = 'certs/1/tb_test/123-a.pdf';
const TEST_KEY_PATH = path.join(LOCAL_DIR, TEST_KEY); // server/uploads/certs/1/tb_test/123-a.pdf

afterEach(() => {
  // Clean up any files written during local-mode tests — remove the created certs/ subtree
  const subtree = path.join(LOCAL_DIR, 'certs');
  if (fs.existsSync(subtree)) {
    fs.rmSync(subtree, { recursive: true, force: true });
  }
});

describe('storage.js — LOCAL MODE (no RAILWAY_OBJECT_STORAGE_ENDPOINT)', () => {
  let storage;

  beforeEach(() => {
    delete process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT;
    jest.resetModules();
    // Require fresh after clearing env
    storage = require('../storage');
  });

  test('uploadFile returns the key and writes buffer to disk', async () => {
    const buf = Buffer.from('hello');
    const result = await storage.uploadFile(TEST_KEY, buf, 'application/pdf');

    expect(result).toBe(TEST_KEY);
    expect(fs.existsSync(TEST_KEY_PATH)).toBe(true);
    expect(fs.readFileSync(TEST_KEY_PATH)).toEqual(buf);
  });

  test('getPresignedUrl returns a file:// string containing the key', async () => {
    // Write the file first so the path is meaningful
    const buf = Buffer.from('hello');
    await storage.uploadFile(TEST_KEY, buf, 'application/pdf');

    const url = await storage.getPresignedUrl(TEST_KEY);
    expect(typeof url).toBe('string');
    expect(url.startsWith('file://')).toBe(true);
    expect(url).toContain(TEST_KEY);
  });

  test('module loads without throwing when endpoint is unset', () => {
    // Already required above — if it threw, beforeEach would have failed
    expect(typeof storage.uploadFile).toBe('function');
    expect(typeof storage.getPresignedUrl).toBe('function');
  });
});

describe('storage.js — S3 MODE (RAILWAY_OBJECT_STORAGE_ENDPOINT set)', () => {
  let storage;
  let mockSend;

  beforeEach(() => {
    process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT = 'https://example.com';
    process.env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY = 'fake-key';
    process.env.RAILWAY_OBJECT_STORAGE_SECRET_KEY = 'fake-secret';
    process.env.RAILWAY_BUCKET_NAME = 'test-bucket';

    mockSend = jest.fn().mockResolvedValue({});

    jest.resetModules();

    jest.mock('@aws-sdk/client-s3', () => {
      const PutObjectCommand = jest.fn(function (params) { this.params = params; });
      const GetObjectCommand = jest.fn(function (params) { this.params = params; });
      const S3Client = jest.fn(function () {
        this.send = mockSend;
      });
      return { S3Client, PutObjectCommand, GetObjectCommand };
    });

    jest.mock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned'),
    }));

    storage = require('../storage');
  });

  afterEach(() => {
    delete process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT;
    delete process.env.RAILWAY_OBJECT_STORAGE_ACCESS_KEY;
    delete process.env.RAILWAY_OBJECT_STORAGE_SECRET_KEY;
    delete process.env.RAILWAY_BUCKET_NAME;
  });

  test('uploadFile calls s3.send once and returns the key', async () => {
    const result = await storage.uploadFile(TEST_KEY, Buffer.from('s3data'), 'application/pdf');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toBe(TEST_KEY);
  });

  test('uploadFile does NOT write to local disk', async () => {
    await storage.uploadFile(TEST_KEY, Buffer.from('s3data'), 'application/pdf');
    expect(fs.existsSync(TEST_KEY_PATH)).toBe(false);
  });

  test('getPresignedUrl returns a signed URL from S3 (not a file:// path)', async () => {
    const url = await storage.getPresignedUrl(TEST_KEY, 300);
    expect(typeof url).toBe('string');
    expect(url.startsWith('file://')).toBe(false);
  });
});
