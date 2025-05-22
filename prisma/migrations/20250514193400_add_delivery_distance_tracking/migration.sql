-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "avgDeliveryDistance" DOUBLE PRECISION,
ADD COLUMN     "warehouseLatitude" DOUBLE PRECISION,
ADD COLUMN     "warehouseLongitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "storeId" TEXT NOT NULL,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAddress" TEXT,
    "deliveryCity" TEXT,
    "deliveryCountry" TEXT,
    "deliveryZipCode" TEXT,
    "deliveryDistance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_storeId_idx" ON "Order"("storeId");

-- CreateIndex
CREATE INDEX "Order_deliveryZipCode_idx" ON "Order"("deliveryZipCode");

-- CreateIndex
CREATE INDEX "Order_fulfilled_idx" ON "Order"("fulfilled");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopifyOrderId_storeId_key" ON "Order"("shopifyOrderId", "storeId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
