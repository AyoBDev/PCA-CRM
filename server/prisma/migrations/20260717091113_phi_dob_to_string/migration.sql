-- Convert dob columns from timestamp to text (YYYY-MM-DD) so they can hold
-- ciphertext for PHI encryption at rest. Time-of-day is meaningless for DOB.
ALTER TABLE "clients"
    ALTER COLUMN "dob" TYPE TEXT USING COALESCE(to_char("dob", 'YYYY-MM-DD'), ''),
    ALTER COLUMN "dob" SET DEFAULT '';
UPDATE "clients" SET "dob" = '' WHERE "dob" IS NULL;
ALTER TABLE "clients" ALTER COLUMN "dob" SET NOT NULL;

ALTER TABLE "employees"
    ALTER COLUMN "dob" TYPE TEXT USING COALESCE(to_char("dob", 'YYYY-MM-DD'), ''),
    ALTER COLUMN "dob" SET DEFAULT '';
UPDATE "employees" SET "dob" = '' WHERE "dob" IS NULL;
ALTER TABLE "employees" ALTER COLUMN "dob" SET NOT NULL;
