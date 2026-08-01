-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "deal_id" INTEGER;

-- CreateIndex
CREATE INDEX "attachments_deal_id_idx" ON "attachments"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_deal_id_file_name_key" ON "attachments"("deal_id", "file_name");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

