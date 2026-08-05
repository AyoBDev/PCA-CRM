-- Lead source channel (referrer | call | website | fax | other)
ALTER TABLE "leads" ADD COLUMN "lead_source" TEXT NOT NULL DEFAULT '';

-- Files/images attached to a lead at intake
CREATE TABLE "lead_documents" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT '',
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_documents_lead_id_idx" ON "lead_documents"("lead_id");

ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
