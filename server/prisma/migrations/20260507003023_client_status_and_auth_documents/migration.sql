-- AlterTable
ALTER TABLE "clients" ADD COLUMN "client_status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "authorization_documents" (
    "id" SERIAL NOT NULL,
    "authorization_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT '',
    "uploaded_by" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authorization_documents_authorization_id_idx" ON "authorization_documents"("authorization_id");

-- AddForeignKey
ALTER TABLE "authorization_documents" ADD CONSTRAINT "authorization_documents_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_documents" ADD CONSTRAINT "authorization_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
