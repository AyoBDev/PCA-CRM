-- Ensure a real unique constraint exists on services.code
CREATE UNIQUE INDEX IF NOT EXISTS "services_code_key" ON "services"("code");
