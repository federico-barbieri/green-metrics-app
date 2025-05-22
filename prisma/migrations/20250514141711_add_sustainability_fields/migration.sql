-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isLocallyProduced" BOOLEAN,
ADD COLUMN     "packagingRatio" DOUBLE PRECISION,
ADD COLUMN     "packagingWeight" DOUBLE PRECISION,
ADD COLUMN     "productWeight" DOUBLE PRECISION,
ADD COLUMN     "sustainableMaterials" DOUBLE PRECISION;
