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
    // Clear every endpoint var the module now checks so local mode is deterministic.
    for (const v of ['RAILWAY_OBJECT_STORAGE_ENDPOINT', 'AWS_ENDPOINT_URL', 'ENDPOINT', 'AWS_ENDPOINT_URL_S3']) {
      delete process.env[v];
    }
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
    expect(typeof storage.downloadFile).toBe('function');
  });

  test('downloadFile returns the bytes that were uploaded (local roundtrip)', async () => {
    const buf = Buffer.from('cert-file-contents');
    await storage.uploadFile(TEST_KEY, buf, 'application/pdf');

    const out = await storage.downloadFile(TEST_KEY);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out).toEqual(buf);
  });

  test('downloadFile returns null for a missing key (local)', async () => {
    const out = await storage.downloadFile('certs/does/not/exist.pdf');
    expect(out).toBeNull();
  });

  test('deleteFile removes the stored file from disk (local)', async () => {
    await storage.uploadFile(TEST_KEY, Buffer.from('bytes'), 'application/pdf');
    expect(fs.existsSync(TEST_KEY_PATH)).toBe(true);

    await storage.deleteFile(TEST_KEY);
    expect(fs.existsSync(TEST_KEY_PATH)).toBe(false);
  });

  test('deleteFile resolves without throwing for a missing key (local)', async () => {
    await expect(storage.deleteFile('certs/does/not/exist.pdf')).resolves.toBeUndefined();
  });

  test('listKeys enumerates stored keys recursively (local)', async () => {
    await storage.uploadFile('certs/1/tb_test/a.pdf', Buffer.from('a'), 'application/pdf');
    await storage.uploadFile('certs/2/cpr/b.pdf', Buffer.from('b'), 'application/pdf');

    const keys = await storage.listKeys('certs/');
    expect(keys.sort()).toEqual(['certs/1/tb_test/a.pdf', 'certs/2/cpr/b.pdf']);
  });

  test('listKeys returns [] for a prefix with nothing under it (local)', async () => {
    const keys = await storage.listKeys('certs/nothing-here/');
    expect(keys).toEqual([]);
  });

  test('listKeys returns POSIX-style keys, never backslashes (local)', async () => {
    await storage.uploadFile('certs/9/x/y.pdf', Buffer.from('y'), 'application/pdf');
    const keys = await storage.listKeys('certs/');
    for (const k of keys) expect(k).not.toContain('\\');
  });

  test('listObjects reports an mtime for every key (local)', async () => {
    await storage.uploadFile('certs/1/tb_test/a.pdf', Buffer.from('a'), 'application/pdf');

    const objs = await storage.listObjects('certs/');
    expect(objs).toHaveLength(1);
    expect(objs[0].key).toBe('certs/1/tb_test/a.pdf');
    expect(typeof objs[0].mtimeMs).toBe('number');
    // Just written, so it should be within a few seconds of now.
    expect(Math.abs(Date.now() - objs[0].mtimeMs)).toBeLessThan(60_000);
  });

  test('deleteFile ignores empty/nullish keys instead of touching the uploads root', async () => {
    await expect(storage.deleteFile('')).resolves.toBeUndefined();
    await expect(storage.deleteFile(null)).resolves.toBeUndefined();
    await expect(storage.deleteFile(undefined)).resolves.toBeUndefined();
    // The uploads root itself must survive.
    expect(fs.existsSync(LOCAL_DIR)).toBe(true);
  });
});

describe('storage.js — S3 MODE via AWS_* fallback (Railway auto-injected vars)', () => {
  let storage;
  let mockSend;

  beforeEach(() => {
    // No RAILWAY_OBJECT_STORAGE_* vars — only the AWS_* set Railway injects.
    delete process.env.RAILWAY_OBJECT_STORAGE_ENDPOINT;
    process.env.AWS_ENDPOINT_URL = 'https://example-bucket.dev';
    process.env.AWS_ACCESS_KEY_ID = 'ak';
    process.env.AWS_SECRET_ACCESS_KEY = 'sk';
    process.env.AWS_S3_BUCKET_NAME = 'my-bucket';
    mockSend = jest.fn().mockResolvedValue({});
    jest.resetModules();
    jest.mock('@aws-sdk/client-s3', () => ({
      S3Client: jest.fn(() => ({ send: mockSend })),
      PutObjectCommand: jest.fn((a) => a),
      GetObjectCommand: jest.fn((a) => a),
      DeleteObjectCommand: jest.fn((a) => a),
      ListObjectsV2Command: jest.fn((a) => a),
    }));
    jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file') }));
    storage = require('../storage');
  });

  afterEach(() => {
    for (const v of ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME']) delete process.env[v];
    jest.unmock('@aws-sdk/client-s3');
    jest.unmock('@aws-sdk/s3-request-presigner');
  });

  test('uses S3 (not local disk) when only AWS_* vars are set', async () => {
    const key = await storage.uploadFile('certs/1/tb_test/x.pdf', Buffer.from('x'), 'application/pdf');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(key).toBe('certs/1/tb_test/x.pdf');
    // getPresignedUrl returns the signed URL, not a file:// path
    const url = await storage.getPresignedUrl('certs/1/tb_test/x.pdf');
    expect(url.startsWith('file://')).toBe(false);
  });

  test('deleteFile issues a DeleteObject call against the bucket', async () => {
    await storage.deleteFile('certs/1/tb_test/x.pdf');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'my-bucket', Key: 'certs/1/tb_test/x.pdf' })
    );
  });

  test('deleteFile does not call S3 for an empty key', async () => {
    await storage.deleteFile('');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('listKeys follows the continuation token across pages', async () => {
    // A bucket with more than 1000 objects pages; missing a page would make
    // every key on it look unreferenced, so this must be exhaustive.
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: 'certs/a.pdf' }, { Key: 'certs/b.pdf' }],
        IsTruncated: true,
        NextContinuationToken: 'page2',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'certs/c.pdf' }],
        IsTruncated: false,
      });

    const keys = await storage.listKeys('certs/');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(keys).toEqual(['certs/a.pdf', 'certs/b.pdf', 'certs/c.pdf']);
  });

  test('listKeys handles an empty bucket response', async () => {
    mockSend.mockResolvedValueOnce({ IsTruncated: false });
    const keys = await storage.listKeys('certs/');
    expect(keys).toEqual([]);
  });

  test('listObjects carries S3 LastModified through as mtimeMs', async () => {
    // Without this the age filter is blind in S3 mode and would happily
    // collect a file uploaded seconds ago whose DB row hasn't committed.
    const when = new Date('2026-01-15T10:00:00Z');
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: 'certs/a.pdf', LastModified: when }],
      IsTruncated: false,
    });

    const objs = await storage.listObjects('certs/');
    expect(objs).toEqual([{ key: 'certs/a.pdf', mtimeMs: when.getTime() }]);
  });

  test('listObjects reports mtimeMs null when S3 omits LastModified', async () => {
    // Null means "unknown", which the caller must treat as not-collectable
    // rather than assuming the object is old.
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: 'certs/a.pdf' }],
      IsTruncated: false,
    });

    const objs = await storage.listObjects('certs/');
    expect(objs).toEqual([{ key: 'certs/a.pdf', mtimeMs: null }]);
  });

  test('listObjects paginates like listKeys', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: 'certs/a.pdf', LastModified: new Date(1000) }],
        IsTruncated: true,
        NextContinuationToken: 'page2',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'certs/b.pdf', LastModified: new Date(2000) }],
        IsTruncated: false,
      });

    const objs = await storage.listObjects('certs/');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(objs.map((o) => o.key)).toEqual(['certs/a.pdf', 'certs/b.pdf']);
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
