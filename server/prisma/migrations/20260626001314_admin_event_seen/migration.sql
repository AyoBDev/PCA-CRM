-- CreateTable
CREATE TABLE "admin_event_seen" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_key" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_event_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_event_seen_user_id_idx" ON "admin_event_seen"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_event_seen_user_id_event_key_key" ON "admin_event_seen"("user_id", "event_key");

-- AddForeignKey
ALTER TABLE "admin_event_seen" ADD CONSTRAINT "admin_event_seen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
