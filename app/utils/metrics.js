// app/utils/metrics.js
import { metrics } from "../routes/metrics";

/**
 * Updates Prometheus metrics for a product
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
        store_id: product.storeId 
      },
      1 // 1 = active
    );
    
    // Update sustainable materials percentage metric
    if (product.sustainableMaterials !== null && product.sustainableMaterials !== undefined) {
      metrics.sustainableMaterialsGauge.set(
        { 
          product_id: product.shopifyProductId, 
          product_title: productTitle, 
          store_id: product.storeId 
        },
        product.sustainableMaterials
      );
    }
    
    // Update packaging ratio metric
    if (product.packagingRatio !== null && product.packagingRatio !== undefined) {
      metrics.packagingRatioGauge.set(
        { 
          product_id: product.shopifyProductId, 
          product_title: productTitle, 
          store_id: product.storeId 
        },
        product.packagingRatio
      );
    }
    
    // Update locally produced metric (convert boolean to 1 or 0)
    if (product.isLocallyProduced !== null && product.isLocallyProduced !== undefined) {
      metrics.locallyProducedGauge.set(
        { 
          product_id: product.shopifyProductId, 
          product_title: productTitle, 
          store_id: product.storeId 
        },
        product.isLocallyProduced ? 1 : 0
      );
    }
    
    return true;
  } catch (error) {
    console.error("Error updating product metrics:", error);
    // Don't throw - metrics errors shouldn't block the main app functionality
    return false;
  }
}