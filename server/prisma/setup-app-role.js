const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const password = process.env.APP_DB_PASSWORD;
  if (!password) {
    console.log('APP_DB_PASSWORD not set — skipping app_user setup');
    return;
  }
  const escaped = password.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN;
      END IF;
    END $$;`);
  await prisma.$executeRawUnsafe(`ALTER ROLE app_user LOGIN PASSWORD '${escaped}' NOBYPASSRLS`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user`);
  await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`);
  await prisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user`);
  console.log('✅ app_user role configured');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
