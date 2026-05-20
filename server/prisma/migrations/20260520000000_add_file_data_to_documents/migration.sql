-- AlterTable
ALTER TABLE "authorization_documents" ADD COLUMN "file_data" BYTEA;

-- AlterTable
ALTER TABLE "client_documents" ADD COLUMN "file_data" BYTEA;
