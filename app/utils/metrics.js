// app/utils/metrics.js
import { metrics } from "../routes/metrics";
import { PrismaClient } from "@prisma/client";
import { updateStoreAggregatedMetrics } from "./storeMetrics";

const prisma = new PrismaClient();

/**
 * Records a product metrics change in the history table
 * @param {Object} product - The product object with metrics data
 */
export async function recordProductMetricsHistory(product) {
  try {
    // Check if this is actually a change by comparing with the last history record
    const lastHistory = await prisma.productMetricsHistory.findFirst({
      where: { productId: product.id },
      orderBy: { timestamp: "desc" },
    });

    // Check if any metrics have actually changed
    const hasChanges =
      !lastHistory ||
      lastHistory.sustainableMaterials !== product.sustainableMaterials ||
      lastHistory.isLocallyProduced !== product.isLocallyProduced ||
      lastHistory.packagingWeight !== product.packagingWeight ||
      lastHistory.productWeight !== product.productWeight ||
      lastHistory.packagingRatio !== product.packagingRatio;

    if (hasChanges) {
      await prisma.productMetricsHistory.create({
        data: {
          productId: product.id,
          sustainableMaterials: product.sustainableMaterials,
          isLocallyProduced: product.isLocallyProduced,
          packagingWeight: product.packagingWeight,
          productWeight: product.productWeight,
          packagingRatio: product.packagingRatio,
        },
      });

      return true;
    }

    return false; // No changes detected
  } catch (error) {
    console.error("Error recording product metrics history:", error);
    return false;
  }
}

/**
 * Updates Prometheus metrics for a product AND records the change in history
 * @param {Object} product - The product object with metrics data
 */
export async function updateProductMetrics(product) {
  try {
    // Safety check - ensure we have the required fields
    if (!product || !product.shopifyProductId || !product.storeId) {
      console.warn("Missing required fields for metrics update:", product);
      return false;
    }

    // Use product title or a fallback if not available
    const productTitle = product.title || `Product ${product.shopifyProductId}`;

    // Set product as active
    metrics.productStatusGauge.set(
      {
        product_id: product.shopifyProductId,
        product_title: productTitle,
        store_id: product.storeId,
      },
      1, // 1 = active
    );

    // Update sustainable materials percentage metric
    if (
      product.sustainableMaterials !== null &&
      product.sustainableMaterials !== undefined
    ) {
      metrics.sustainableMaterialsGauge.set(
        {
          product_id: product.shopifyProductId,
          product_title: productTitle,
          store_id: product.storeId,
        },
        product.sustainableMaterials,
      );
    }

    // Update packaging ratio metric
    if (
      product.packagingRatio !== null &&
      product.packagingRatio !== undefined
    ) {
      metrics.packagingRatioGauge.set(
        {
          product_id: product.shopifyProductId,
          product_title: productTitle,
          store_id: product.storeId,
        },
        product.packagingRatio,
      );
    }

    // Update locally produced metric (convert boolean to 1 or 0)
    if (
      product.isLocallyProduced !== null &&
      product.isLocallyProduced !== undefined
    ) {
      metrics.locallyProducedGauge.set(
        {
          product_id: product.shopifyProductId,
          product_title: productTitle,
          store_id: product.storeId,
        },
        product.isLocallyProduced ? 1 : 0,
      );
    }

    // Record the change in history
    await recordProductMetricsHistory(product);

    // Update store-level aggregated metrics
    await updateStoreAggregatedMetrics(product.storeId);

    return true;
  } catch (error) {
    console.error("Error updating product metrics:", error);
    // Don't throw - metrics errors shouldn't block the main app functionality
    return false;
  }
}

/**
 * Get historical metrics for a product
 * @param {string} productId - The product ID
 * @param {number} days - Number of days to look back (default 1825 = 5 years)
 */
export async function getProductMetricsHistory(productId, days = 1825) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const history = await prisma.productMetricsHistory.findMany({
      where: {
        productId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: "asc" },
      include: {
        product: {
          select: {
            title: true,
            shopifyProductId: true,
          },
        },
      },
    });

    return history;
  } catch (error) {
    console.error("Error fetching product metrics history:", error);
    throw error;
  }
}
