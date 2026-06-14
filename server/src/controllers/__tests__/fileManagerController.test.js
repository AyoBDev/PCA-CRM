const prisma = require('../../lib/prisma');

describe('FileManager Controller', () => {
    let testFolderId;

    beforeAll(async () => {
        await prisma.adminFile.deleteMany({});
        await prisma.adminFolder.deleteMany({});
    });

    afterAll(async () => {
        await prisma.adminFile.deleteMany({});
        await prisma.adminFolder.deleteMany({});
        await prisma.$disconnect();
    });

    test('create root folder', async () => {
        const folder = await prisma.adminFolder.create({
            data: { name: 'TestFolder', path: '/TestFolder', parentId: null },
        });
        testFolderId = folder.id;
        expect(folder.name).toBe('TestFolder');
        expect(folder.path).toBe('/TestFolder');
    });

    test('create subfolder', async () => {
        const sub = await prisma.adminFolder.create({
            data: { name: 'SubFolder', path: '/TestFolder/SubFolder', parentId: testFolderId },
        });
        expect(sub.parentId).toBe(testFolderId);
    });

    test('unique constraint prevents duplicate names in same parent', async () => {
        await expect(
            prisma.adminFolder.create({
                data: { name: 'SubFolder', path: '/TestFolder/SubFolder', parentId: testFolderId },
            })
        ).rejects.toThrow();
    });

    test('create file record', async () => {
        const file = await prisma.adminFile.create({
            data: {
                name: 'test.pdf',
                folderId: testFolderId,
                storageKey: 'admin-files/TestFolder/123-test.pdf',
                fileSize: 1024,
                mimeType: 'application/pdf',
            },
        });
        expect(file.name).toBe('test.pdf');
        expect(file.folderId).toBe(testFolderId);
    });

    test('cascade delete removes files', async () => {
        await prisma.adminFolder.delete({ where: { id: testFolderId } });
        const remaining = await prisma.adminFile.findMany({
            where: { folderId: testFolderId },
        });
        expect(remaining).toHaveLength(0);
    });
});
