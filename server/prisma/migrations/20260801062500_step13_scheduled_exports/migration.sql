-- CreateTable
CREATE TABLE "scheduled_exports" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "hour_utc" INTEGER NOT NULL DEFAULT 6,
    "email" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "scheduled_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_files" (
    "id" SERIAL NOT NULL,
    "schedule_id" INTEGER,
    "kind" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size" INTEGER,
    "mail_status" TEXT NOT NULL DEFAULT 'skipped',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "export_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_exports_enabled_next_run_at_idx" ON "scheduled_exports"("enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "export_files_created_at_idx" ON "export_files"("created_at");

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "scheduled_exports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

