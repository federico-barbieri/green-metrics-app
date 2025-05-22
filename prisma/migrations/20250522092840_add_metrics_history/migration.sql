-- CreateTable
CREATE TABLE "ProductMetricsHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sustainableMaterials" DOUBLE PRECISION,
    "isLocallyProduced" BOOLEAN,
    "packagingWeight" DOUBLE PRECISION,
    "productWeight" DOUBLE PRECISION,
    "packagingRatio" DOUBLE PRECISION,

    CONSTRAINT "ProductMetricsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMetricsHistory_productId_idx" ON "ProductMetricsHistory"("productId");

-- CreateIndex
CREATE INDEX "ProductMetricsHistory_timestamp_idx" ON "ProductMetricsHistory"("timestamp");

-- CreateIndex
CREATE INDEX "ProductMetricsHistory_productId_timestamp_idx" ON "ProductMetricsHistory"("productId", "timestamp");

-- AddForeignKey
ALTER TABLE "ProductMetricsHistory" ADD CONSTRAINT "ProductMetricsHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
