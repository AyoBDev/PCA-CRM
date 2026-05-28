-- CreateTable
CREATE TABLE "employee_certifications" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "cert_type" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "file_name" TEXT NOT NULL DEFAULT '',
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "file_type" TEXT NOT NULL DEFAULT '',
    "file_data" BYTEA,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_certifications_employee_id_cert_type_idx" ON "employee_certifications"("employee_id", "cert_type");

-- AddForeignKey
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
