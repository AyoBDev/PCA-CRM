-- AlterTable
ALTER TABLE "authorization_documents" ADD COLUMN "file_data" BYTEA;

-- AlterTable
ALTER TABLE "client_documents" ADD COLUMN "file_data" BYTEA;

-- Purge orphaned document records that have no file data (files lost during prior deploys)
DELETE FROM "authorization_documents" WHERE "file_data" IS NULL;
DELETE FROM "client_documents" WHERE "file_data" IS NULL;
