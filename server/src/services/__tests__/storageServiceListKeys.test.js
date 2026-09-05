'use strict';

const fs = require('fs');
const path = require('path');

// storageService.js LOCAL_DIR = server/uploads/admin-files
// From this test file: server/src/services/__tests__ → up 3 → server/
const LOCAL_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'admin-files');
const SCRATCH = path.join(LOCAL_DIR, '__listkeys_test__');

afterEach(() => {
    if (fs.existsSync(SCRATCH)) fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('storageService.listKeys — LOCAL MODE', () => {
    let storage;

    beforeEach(() => {
        for (const v of ['AWS_ENDPOINT_URL', 'ENDPOINT', 'AWS_ENDPOINT_URL_S3']) delete process.env[v];
        jest.resetModules();
        storage = require('../storageService');
    });

    test('enumerates keys relative to the admin-files root, recursively', async () => {
        fs.mkdirSync(path.join(SCRATCH, 'nested'), { recursive: true });
        fs.writeFileSync(path.join(SCRATCH, 'a.pdf'), 'a');
        fs.writeFileSync(path.join(SCRATCH, 'nested', 'b.pdf'), 'b');

        const keys = await storage.listKeys('__listkeys_test__/');

        // Keys must come back relative to LOCAL_DIR (admin-files), NOT the
        // uploads root — that difference is what keeps File Manager files from
        // being misread as orphans by the reconciliation script.
        expect(keys.sort()).toEqual([
            '__listkeys_test__/a.pdf',
            '__listkeys_test__/nested/b.pdf',
        ]);
    });

    test('returns [] for a prefix with nothing under it', async () => {
        const keys = await storage.listKeys('__listkeys_test__/nope/');
        expect(keys).toEqual([]);
    });

    test('listObjects reports an mtime for every key', async () => {
        fs.mkdirSync(SCRATCH, { recursive: true });
        fs.writeFileSync(path.join(SCRATCH, 'a.pdf'), 'a');

        const objs = await storage.listObjects('__listkeys_test__/');
        expect(objs).toHaveLength(1);
        expect(objs[0].key).toBe('__listkeys_test__/a.pdf');
        expect(typeof objs[0].mtimeMs).toBe('number');
        expect(Math.abs(Date.now() - objs[0].mtimeMs)).toBeLessThan(60_000);
    });

    test('returns POSIX-style keys, never backslashes', async () => {
        fs.mkdirSync(path.join(SCRATCH, 'deep', 'deeper'), { recursive: true });
        fs.writeFileSync(path.join(SCRATCH, 'deep', 'deeper', 'c.pdf'), 'c');

        const keys = await storage.listKeys('__listkeys_test__/');
        for (const k of keys) expect(k).not.toContain('\\');
    });
});

describe('storageService.listKeys — S3 MODE', () => {
    let storage;
    let mockSend;

    beforeEach(() => {
        process.env.AWS_ENDPOINT_URL = 'https://example-bucket.dev';
        process.env.AWS_ACCESS_KEY_ID = 'ak';
        process.env.AWS_SECRET_ACCESS_KEY = 'sk';
        process.env.AWS_S3_BUCKET_NAME = 'my-bucket';
        mockSend = jest.fn();
        jest.resetModules();
        jest.mock('@aws-sdk/client-s3', () => ({
            S3Client: jest.fn(() => ({ send: mockSend })),
            PutObjectCommand: jest.fn((a) => a),
            GetObjectCommand: jest.fn((a) => a),
            DeleteObjectCommand: jest.fn((a) => a),
            DeleteObjectsCommand: jest.fn((a) => a),
            ListObjectsV2Command: jest.fn((a) => a),
        }));
        storage = require('../storageService');
    });

    afterEach(() => {
        for (const v of ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME']) {
            delete process.env[v];
        }
        jest.unmock('@aws-sdk/client-s3');
    });

    test('follows the continuation token across pages', async () => {
        mockSend
            .mockResolvedValueOnce({
                Contents: [{ Key: 'admin-files/a.pdf' }],
                IsTruncated: true,
                NextContinuationToken: 'page2',
            })
            .mockResolvedValueOnce({
                Contents: [{ Key: 'admin-files/b.pdf' }],
                IsTruncated: false,
            });

        const keys = await storage.listKeys('admin-files/');
        expect(mockSend).toHaveBeenCalledTimes(2);
        expect(keys).toEqual(['admin-files/a.pdf', 'admin-files/b.pdf']);
    });

    test('handles an empty response', async () => {
        mockSend.mockResolvedValueOnce({ IsTruncated: false });
        const keys = await storage.listKeys('admin-files/');
        expect(keys).toEqual([]);
    });

    test('listObjects carries S3 LastModified through as mtimeMs', async () => {
        const when = new Date('2026-01-15T10:00:00Z');
        mockSend.mockResolvedValueOnce({
            Contents: [{ Key: 'admin-files/a.pdf', LastModified: when }],
            IsTruncated: false,
        });

        const objs = await storage.listObjects('admin-files/');
        expect(objs).toEqual([{ key: 'admin-files/a.pdf', mtimeMs: when.getTime() }]);
    });

    test('listObjects reports mtimeMs null when S3 omits LastModified', async () => {
        mockSend.mockResolvedValueOnce({
            Contents: [{ Key: 'admin-files/a.pdf' }],
            IsTruncated: false,
        });

        const objs = await storage.listObjects('admin-files/');
        expect(objs).toEqual([{ key: 'admin-files/a.pdf', mtimeMs: null }]);
    });
});
