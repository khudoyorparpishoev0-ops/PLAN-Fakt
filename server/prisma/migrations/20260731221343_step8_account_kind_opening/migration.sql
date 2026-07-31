-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "opening_dirams" BIGINT NOT NULL DEFAULT 0;
