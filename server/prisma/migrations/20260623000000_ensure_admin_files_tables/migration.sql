-- CreateTable (idempotent — fixes production where migration 20260614 was marked applied but tables missing)
CREATE TABLE IF NOT EXISTS "admin_folders" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "path" TEXT NOT NULL DEFAULT '/',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "admin_files" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "folder_id" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT '',
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "admin_folders_parent_id_idx" ON "admin_folders"("parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "admin_folders_parent_id_name_key" ON "admin_folders"("parent_id", "name");
CREATE INDEX IF NOT EXISTS "admin_files_folder_id_idx" ON "admin_files"("folder_id");
CREATE UNIQUE INDEX IF NOT EXISTS "admin_files_folder_id_name_key" ON "admin_files"("folder_id", "name");

-- AddForeignKey (skip if exists)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_folders_parent_id_fkey') THEN
        ALTER TABLE "admin_folders" ADD CONSTRAINT "admin_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "admin_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_files_folder_id_fkey') THEN
        ALTER TABLE "admin_files" ADD CONSTRAINT "admin_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "admin_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_files_uploaded_by_fkey') THEN
        ALTER TABLE "admin_files" ADD CONSTRAINT "admin_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
