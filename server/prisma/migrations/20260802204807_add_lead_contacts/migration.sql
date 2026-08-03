-- CreateTable
CREATE TABLE "lead_contacts" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT 'call',
    "note" TEXT NOT NULL DEFAULT '',
    "follow_up_date" TIMESTAMP(3),
    "created_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_contacts_lead_id_idx" ON "lead_contacts"("lead_id");

-- AddForeignKey
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
