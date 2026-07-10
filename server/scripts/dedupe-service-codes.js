const prisma = require('../src/lib/prisma');

async function main() {
  const all = await prisma.service.findMany({ orderBy: { id: 'asc' } });
  const seen = new Map();
  const toArchive = [];
  for (const s of all) {
    if (seen.has(s.code)) {
      const prev = seen.get(s.code);
      // keep the newest (higher id), archive the older
      const older = s.id > prev.id ? prev : s;
      const newer = s.id > prev.id ? s : prev;
      toArchive.push(older.id);
      seen.set(s.code, newer);
    } else {
      seen.set(s.code, s);
    }
  }
  for (const id of toArchive) {
    await prisma.service.update({ where: { id }, data: { code: `DUP_${id}_${Date.now()}` , archivedAt: new Date() } });
  }
  console.log(`Deduped ${toArchive.length} duplicate service code(s).`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
