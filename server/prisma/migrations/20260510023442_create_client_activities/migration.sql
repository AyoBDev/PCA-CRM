-- CreateTable
CREATE TABLE "client_activities" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "contact_name" TEXT NOT NULL DEFAULT '',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_activities_client_id_idx" ON "client_activities"("client_id");

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
