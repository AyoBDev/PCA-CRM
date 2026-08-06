-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "emergency_contact_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergency_contact_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergency_contact_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergency_contact_relationship" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gender" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "preferred_language" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ssn" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "document_types" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requires_expiry" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cert_types" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "renewal_years" INTEGER,
    "requires_expiry" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cert_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_documents" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "file_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_requirements" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "catalog_type_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'required',
    "rejection_reason" TEXT NOT NULL DEFAULT '',
    "due_date" TIMESTAMP(3),
    "document_id" INTEGER,
    "certification_id" INTEGER,
    "policy_ack_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "document_type_id" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "expiration_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_policy_acks" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "policy_document_id" INTEGER NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "employee_policy_acks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_types_key_key" ON "document_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "cert_types_key_key" ON "cert_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "policy_documents_key_key" ON "policy_documents"("key");

-- CreateIndex
CREATE INDEX "employee_requirements_employee_id_kind_idx" ON "employee_requirements"("employee_id", "kind");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_idx" ON "employee_documents"("employee_id");

-- CreateIndex
CREATE INDEX "employee_policy_acks_employee_id_idx" ON "employee_policy_acks"("employee_id");

-- AddForeignKey
ALTER TABLE "employee_requirements" ADD CONSTRAINT "employee_requirements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_policy_acks" ADD CONSTRAINT "employee_policy_acks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_policy_acks" ADD CONSTRAINT "employee_policy_acks_policy_document_id_fkey" FOREIGN KEY ("policy_document_id") REFERENCES "policy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
