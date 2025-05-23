import { metrics } from "../routes/metrics";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Updates store-level aggregated metrics
 * @param {string} storeId - The store ID to update metrics for
 */
export async function updateStoreAggregatedMetrics(storeId) {
  try {
    // Get store info
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        products: {
          where: {
            // Only include active products (not deleted)
            // You can add a "deleted" field later if needed
          },
        },
      },
    });

    if (!store) {
      console.warn(`Store not found: ${storeId}`);
      return false;
    }

    const products = store.products;
    const storeLabels = {
      store_id: storeId,
      store_name: store.name || store.shopifyDomain.split(".")[0],
      store_domain: store.shopifyDomain,
    };

    // 1. Total product count
    metrics.storeProductCountGauge.set(storeLabels, products.length);

    // 2. Average sustainable materials percentage
    const productsWithSustainableMaterials = products.filter(
      (p) =>
        p.sustainableMaterials !== null && p.sustainableMaterials !== undefined,
    );

    if (productsWithSustainableMaterials.length > 0) {
      const avgSustainableMaterials =
        productsWithSustainableMaterials.reduce(
          (sum, p) => sum + p.sustainableMaterials,
          0,
        ) / productsWithSustainableMaterials.length;

      metrics.storeAvgSustainableMaterialsGauge.set(
        storeLabels,
        avgSustainableMaterials,
      );
    }

    // 3. Count of locally produced products
    const localProductsCount = products.filter(
      (p) => p.isLocallyProduced === true,
    ).length;
    metrics.storeLocalProductsGauge.set(storeLabels, localProductsCount);

    // 4. Average delivery distance (if available)
    if (
      store.avgDeliveryDistance !== null &&
      store.avgDeliveryDistance !== undefined
    ) {
      metrics.storeAvgDeliveryDistanceGauge.set(
        storeLabels,
        store.avgDeliveryDistance,
      );
    }

    console.log(
      `📊 Updated store metrics for ${store.name || store.shopifyDomain}`,
    );
    return true;
  } catch (error) {
    console.error("Error updating store aggregated metrics:", error);
    return false;
  }
}

/**
 * Updates metrics for all stores
 */
export async function updateAllStoresMetrics() {
  try {
    const stores = await prisma.store.findMany({
      select: { id: true },
    });

    for (const store of stores) {
      await updateStoreAggregatedMetrics(store.id);
    }

    console.log(`📊 Updated metrics for ${stores.length} stores`);
    return true;
  } catch (error) {
    console.error("Error updating all store metrics:", error);
    return false;
  }
}
