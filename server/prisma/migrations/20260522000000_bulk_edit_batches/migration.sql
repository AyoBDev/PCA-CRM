CREATE TABLE "bulk_edit_batches" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "user_name" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'UPDATE',
    "shift_count" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL DEFAULT '[]',
    "undone_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bulk_edit_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bulk_edit_batches_user_id_idx" ON "bulk_edit_batches"("user_id");
CREATE INDEX "bulk_edit_batches_created_at_idx" ON "bulk_edit_batches"("created_at");
