/*
  Warnings:

  - You are about to drop the column `isLocallyProduced` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `sustainabilityScore` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "isLocallyProduced",
DROP COLUMN "sustainabilityScore";
