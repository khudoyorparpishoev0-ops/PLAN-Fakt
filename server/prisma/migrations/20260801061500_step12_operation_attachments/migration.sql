-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_request_id_fkey";

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "operation_id" INTEGER,
ADD COLUMN     "uploaded_by_id" INTEGER,
ALTER COLUMN "request_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "attachments_operation_id_idx" ON "attachments"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_operation_id_file_name_key" ON "attachments"("operation_id", "file_name");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

