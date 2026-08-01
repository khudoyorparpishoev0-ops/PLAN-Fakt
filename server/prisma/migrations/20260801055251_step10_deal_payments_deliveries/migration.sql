-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "deal_id" INTEGER;

-- CreateTable
CREATE TABLE "deliveries" (
    "id" SERIAL NOT NULL,
    "deal_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "is_plan" BOOLEAN NOT NULL DEFAULT false,
    "entity_name" TEXT,
    "counterparty_id" INTEGER,
    "project_id" INTEGER,
    "comment" TEXT,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_positions" (
    "id" SERIAL NOT NULL,
    "delivery_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "good_id" INTEGER,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'шт',
    "price_dirams" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "delivery_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliveries_deal_id_idx" ON "deliveries"("deal_id");

-- CreateIndex
CREATE INDEX "delivery_positions_delivery_id_idx" ON "delivery_positions"("delivery_id");

-- CreateIndex
CREATE INDEX "operations_deal_id_idx" ON "operations"("deal_id");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_positions" ADD CONSTRAINT "delivery_positions_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_positions" ADD CONSTRAINT "delivery_positions_good_id_fkey" FOREIGN KEY ("good_id") REFERENCES "goods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
