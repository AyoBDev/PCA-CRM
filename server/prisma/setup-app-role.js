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

  // Audit-log immutability: the application request path (which connects as
  // app_user via APP_DATABASE_URL) must only ever APPEND audit rows — never
  // rewrite or erase them. The blanket GRANT above hands app_user
  // UPDATE/DELETE on every table, so we revoke exactly those two on audit_logs
  // afterward. app_user keeps SELECT (the History page reads logs) and INSERT
  // (auditService writes). Deliberate maintenance — the retention purge — runs
  // on the OWNER connection (DATABASE_URL), not app_user, so it is unaffected.
  // Idempotent: REVOKE of a privilege the role no longer holds is a no-op, and
  // this runs on every boot after `prisma migrate deploy`, so the table exists.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM app_user;
      END IF;
    END $$;`);

  console.log('✅ app_user role configured (audit_logs is append-only for app_user)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
