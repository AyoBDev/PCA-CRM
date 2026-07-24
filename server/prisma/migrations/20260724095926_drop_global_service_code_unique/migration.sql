-- 20260710191708_service_code_unique (main) created a global unique index on
-- services(code). Under multi-tenancy each agency has its own Service rows and
-- the same code (e.g. "PCS") legitimately exists once per agency — schema.prisma
-- already models this as @@unique([agencyId, code]) with no global unique. The
-- leftover global index breaks agency creation/service seeding for every agency
-- after the first to use a given code. Do not edit the historical migration;
-- just drop the index it created.
DROP INDEX IF EXISTS "services_code_key";
