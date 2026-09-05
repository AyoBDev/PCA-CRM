'use strict';

const {
    classifyKeys,
    collectReferencedKeys,
    ownerFor,
    stripTenant,
    matchesPrefix,
    parseArgs,
    OWNERS,
} = require('../reconcile-orphaned-files');

describe('OWNERS coverage', () => {
    test('covers every prefix the app writes under', () => {
        const prefixes = OWNERS.map((o) => o.prefix).sort();
        expect(prefixes).toEqual([
            'admin-files/',
            'auth-documents/',
            'certs/',
            'client-documents/',
            'documents/',       // legacy client_documents prefix, still referenced
            'employee-docs/',
            'lead-documents/',
            'policy-documents/',
        ]);
    });

    test('admin files are read through the admin storage module, everything else through lib', () => {
        // The File Manager's local root is uploads/admin-files, not uploads.
        // Reading it with the wrong module would make all of its live files
        // look unreferenced.
        const admin = OWNERS.filter((o) => o.module === 'admin').map((o) => o.table);
        expect(admin).toEqual(['admin_files']);
        for (const o of OWNERS.filter((o) => o.table !== 'admin_files')) {
            expect(o.module).toBe('lib');
        }
    });
});

describe('key shape helpers', () => {
    test('stripTenant removes an agency namespace', () => {
        expect(stripTenant('agency/1/certs/2/tb/a.pdf')).toBe('certs/2/tb/a.pdf');
        expect(stripTenant('certs/2/tb/a.pdf')).toBe('certs/2/tb/a.pdf');
    });

    test('matchesPrefix accepts both tenant-prefixed and bare keys', () => {
        expect(matchesPrefix('agency/3/certs/a.pdf', 'certs/')).toBe(true);
        expect(matchesPrefix('certs/a.pdf', 'certs/')).toBe(true);
        expect(matchesPrefix('other/a.pdf', 'certs/')).toBe(false);
    });

    test('ownerFor resolves a key to its owning table', () => {
        expect(ownerFor('certs/1/tb/a.pdf').table).toBe('certification_uploads');
        expect(ownerFor('agency/2/lead-documents/5/a.pdf').table).toBe('lead_documents');
        expect(ownerFor('documents/1/legacy.pdf').table).toBe('client_documents');
        expect(ownerFor('admin-files/Insurance/a.pdf').table).toBe('admin_files');
        expect(ownerFor('something-else/a.pdf')).toBeNull();
    });
});

describe('classifyKeys', () => {
    test('separates referenced files from orphans', () => {
        const referenced = new Set(['certs/1/tb/keep.pdf']);
        const { orphans, referencedCount } = classifyKeys({
            storedKeys: [
                { key: 'certs/1/tb/keep.pdf', module: 'lib' },
                { key: 'certs/1/tb/gone.pdf', module: 'lib' },
            ],
            referenced,
        });

        expect(referencedCount).toBe(1);
        expect(orphans).toEqual([
            { key: 'certs/1/tb/gone.pdf', owner: 'certification uploads', module: 'lib' },
        ]);
    });

    test('a tenant-prefixed object matches a bare key in the DB', () => {
        // Uploaders differ on whether they namespace keys, so a mismatch here
        // would delete live files.
        const { orphans, referencedCount } = classifyKeys({
            storedKeys: [{ key: 'agency/1/certs/1/tb/a.pdf', module: 'lib' }],
            referenced: new Set(['certs/1/tb/a.pdf']),
        });

        expect(referencedCount).toBe(1);
        expect(orphans).toEqual([]);
    });

    test('a bare object matches a tenant-prefixed key in the DB', () => {
        const { orphans, referencedCount } = classifyKeys({
            storedKeys: [{ key: 'certs/1/tb/a.pdf', module: 'lib' }],
            referenced: new Set(['agency/1/certs/1/tb/a.pdf', 'certs/1/tb/a.pdf']),
        });

        expect(referencedCount).toBe(1);
        expect(orphans).toEqual([]);
    });

    test('keys outside every known prefix are reported, never collected', () => {
        const { orphans, unrecognized } = classifyKeys({
            storedKeys: [{ key: 'mystery/thing.bin', module: 'lib' }],
            referenced: new Set(),
        });

        expect(orphans).toEqual([]);
        expect(unrecognized).toEqual(['mystery/thing.bin']);
    });

    test('legacy client-document keys under documents/ are recognized', () => {
        const { orphans, unrecognized } = classifyKeys({
            storedKeys: [{ key: 'documents/1224/old.pdf', module: 'lib' }],
            referenced: new Set(),
        });

        expect(unrecognized).toEqual([]);
        expect(orphans[0].owner).toBe('client documents (legacy)');
    });

    test('an empty reference set does not silently mark everything collectable', () => {
        // Guards the nightmare case: if the DB read returned nothing, every
        // stored file classifies as an orphan. The script aborts before this
        // point on a query failure, but the counts must still be truthful.
        const { orphans } = classifyKeys({
            storedKeys: [
                { key: 'certs/a.pdf', module: 'lib' },
                { key: 'admin-files/b.pdf', module: 'admin' },
            ],
            referenced: new Set(),
        });
        expect(orphans).toHaveLength(2);
    });
});

describe('collectReferencedKeys', () => {
    test('stores both the raw and tenant-stripped alias of every key', async () => {
        const db = {
            $queryRawUnsafe: jest.fn().mockResolvedValue([{ key: 'agency/1/certs/a.pdf' }]),
        };
        const owners = [{ label: 'certs', prefix: 'certs/', table: 'certification_uploads', column: 'bucket_key', module: 'lib' }];

        const { referenced } = await collectReferencedKeys(db, owners);

        expect(referenced.has('agency/1/certs/a.pdf')).toBe(true);
        expect(referenced.has('certs/a.pdf')).toBe(true);
    });

    test('reads a shared table only once when several prefixes point at it', async () => {
        const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
        const owners = [
            { label: 'legacy', prefix: 'documents/', table: 'client_documents', column: 'file_path', module: 'lib' },
            { label: 'current', prefix: 'client-documents/', table: 'client_documents', column: 'file_path', module: 'lib' },
        ];

        await collectReferencedKeys(db, owners);
        expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    test('propagates a query failure instead of returning a partial set', async () => {
        // A partial reference set would classify live files as orphans, so this
        // must throw and abort the run rather than degrade.
        const db = {
            $queryRawUnsafe: jest.fn()
                .mockResolvedValueOnce([{ key: 'certs/a.pdf' }])
                .mockRejectedValueOnce(new Error('relation does not exist')),
        };
        const owners = [
            { label: 'certs', prefix: 'certs/', table: 'certification_uploads', column: 'bucket_key', module: 'lib' },
            { label: 'leads', prefix: 'lead-documents/', table: 'lead_documents', column: 'file_path', module: 'lib' },
        ];

        await expect(collectReferencedKeys(db, owners)).rejects.toThrow('relation does not exist');
    });
});

describe('parseArgs', () => {
    test('defaults to a dry run with a 7-day age floor', () => {
        expect(parseArgs([])).toEqual({ execute: false, verbose: false, minAgeDays: 7 });
    });

    test('deletion requires an explicit --execute', () => {
        expect(parseArgs(['--verbose']).execute).toBe(false);
        expect(parseArgs(['--execute']).execute).toBe(true);
    });

    test('accepts a custom age floor, including 0', () => {
        expect(parseArgs(['--min-age-days=30']).minAgeDays).toBe(30);
        expect(parseArgs(['--min-age-days=0']).minAgeDays).toBe(0);
    });

    test('rejects a malformed age floor rather than defaulting silently', () => {
        expect(() => parseArgs(['--min-age-days=abc'])).toThrow(/non-negative/);
        expect(() => parseArgs(['--min-age-days=-5'])).toThrow(/non-negative/);
    });
});
