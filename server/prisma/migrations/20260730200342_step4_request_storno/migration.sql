-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "storno_at" TIMESTAMP(3),
ADD COLUMN     "storno_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_storno_by_id_fkey" FOREIGN KEY ("storno_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
