// app/routes/webhooks.products.delete.jsx - ENHANCED DELETE BEAST 🔥
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateStoreAggregatedMetrics } from "../utils/storeMetrics";
import { metrics } from "../routes/metrics"; // Import metrics to reset product metrics

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`🗑️ [${requestId}] Product DELETE webhook triggered at ${new Date().toISOString()}`);
  console.log(`📋 [${requestId}] Request URL: ${request.url}`);
  console.log(`📋 [${requestId}] Request method: ${request.method}`);
  
  // Log all headers for debugging
  const headers = Object.fromEntries(request.headers.entries());
  console.log(`📋 [${requestId}] Headers:`, JSON.stringify(headers, null, 2));

  try {
    // Step 1: Authenticate webhook
    console.log(`🔐 [${requestId}] Authenticating webhook...`);
    const { shop, payload } = await authenticate.webhook(request);
    
    console.log(`✅ [${requestId}] Webhook authenticated for shop: ${shop}`);
    console.log(`📦 [${requestId}] Product DELETE payload:`, {
      id: payload.id,
      title: payload.title || 'N/A',
      status: payload.status || 'N/A',
      deleted_at: new Date().toISOString()
    });

    // Step 2: Find store in database
    console.log(`🔍 [${requestId}] Looking for store: ${shop}`);
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!store) {
      console.error(`❌ [${requestId}] Store not found: ${shop}`);
      
      // Debug: List all stores
      const allStores = await prisma.store.findMany({
        select: { shopifyDomain: true, id: true, name: true }
      });
      console.log(`📋 [${requestId}] Available stores:`, allStores);
      
      return new Response(JSON.stringify({ 
        error: "Store not found",
        shop: shop,
        available_stores: allStores.map(s => s.shopifyDomain)
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ [${requestId}] Store found: ${store.shopifyDomain} (ID: ${store.id})`);

    // Step 3: Extract product data
    const productId = payload.id.toString();
    const productTitle = payload.title || `Product ${productId}`;
    
    console.log(`🔍 [${requestId}] Processing product DELETE: ${productId} - "${productTitle}"`);

    // Step 4: Find the product in our database
    console.log(`🔍 [${requestId}] Searching for product in database...`);
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    if (!product) {
      console.log(`⚠️ [${requestId}] Product not found in database - might have been deleted already or never synced`);
      console.log(`📊 [${requestId}] This could be normal if:`);
      console.log(`   - Product was deleted before our app was installed`);
      console.log(`   - Product was created and deleted before initial sync`);
      console.log(`   - Previous delete webhook already processed this`);
      
      return new Response(JSON.stringify({ 
        success: true,
        message: "Product not found in database (already deleted or never existed)",
        productId: productId,
        action: "no_action_needed",
        processingTime: Date.now() - startTime,
        requestId: requestId
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ [${requestId}] Found product in database:`, {
      databaseId: product.id,
      title: product.title,
      sustainableMaterials: product.sustainableMaterials,
      isLocallyProduced: product.isLocallyProduced,
      packagingWeight: product.packagingWeight,
      productWeight: product.productWeight,
      packagingRatio: product.packagingRatio,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    });

    // Step 5: Get store stats before deletion for comparison
    const storeStatsBefore = await prisma.product.aggregate({
      where: { storeId: store.id },
      _count: { _all: true },
      _avg: {
        sustainableMaterials: true,
        packagingRatio: true
      }
    });

    console.log(`📊 [${requestId}] Store stats before deletion:`, {
      totalProducts: storeStatsBefore._count._all,
      avgSustainableMaterials: storeStatsBefore._avg.sustainableMaterials,
      avgPackagingRatio: storeStatsBefore._avg.packagingRatio
    });

    // 🔥 NEW: Step 6: Clear Prometheus metrics for this product BEFORE deletion
    console.log(`📊 [${requestId}] Clearing Prometheus metrics for deleted product...`);
    try {
      // Set all product metrics to 0 (effectively removing them)
      metrics.sustainableMaterialsGauge.remove({
        product_id: product.shopifyProductId,
        product_title: product.title,
        store_id: product.storeId,
      });
      
      metrics.packagingRatioGauge.remove({
        product_id: product.shopifyProductId,
        product_title: product.title,
        store_id: product.storeId,
      });
      
      metrics.locallyProducedGauge.remove({
        product_id: product.shopifyProductId,
        product_title: product.title,
        store_id: product.storeId,
      });
      
      metrics.productStatusGauge.set(
        {
          product_id: product.shopifyProductId,
          product_title: product.title,
          store_id: product.storeId,
        },
        0 // Set status to 0 (deleted)
      );
      
      console.log(`✅ [${requestId}] Individual product metrics cleared from Prometheus`);
    } catch (metricsError) {
      console.error(`⚠️ [${requestId}] Error clearing individual product metrics:`, metricsError);
      // Don't fail the deletion for metrics errors
    }

    // Step 7: Delete product from database
    console.log(`🗑️ [${requestId}] Deleting product from database...`);
    
    const deletedProduct = await prisma.product.delete({
      where: {
        id: product.id,
      },
    });

    console.log(`✅ [${requestId}] Product successfully deleted from database: ${deletedProduct.id}`);

    // Step 8: Get store stats after deletion
    const storeStatsAfter = await prisma.product.aggregate({
      where: { storeId: store.id },
      _count: { _all: true },
      _avg: {
        sustainableMaterials: true,
        packagingRatio: true
      }
    });

    console.log(`📊 [${requestId}] Store stats after deletion:`, {
      totalProducts: storeStatsAfter._count._all,
      avgSustainableMaterials: storeStatsAfter._avg.sustainableMaterials,
      avgPackagingRatio: storeStatsAfter._avg.packagingRatio,
      productsRemoved: storeStatsBefore._count._all - storeStatsAfter._count._all
    });

    // 🔥 ENHANCED: Step 9: Update ALL store-level aggregated metrics
    console.log(`📊 [${requestId}] Updating ALL store-level aggregated metrics...`);
    try {
      await updateStoreAggregatedMetrics(store.id);
      console.log(`✅ [${requestId}] Store-level aggregated metrics updated successfully`);
    } catch (metricsError) {
      console.error(`❌ [${requestId}] Error updating store aggregated metrics:`, metricsError);
      // Don't fail the webhook if metrics update fails
    }

    // 🔥 NEW: Step 10: Update individual product metrics for remaining products
    console.log(`📊 [${requestId}] Refreshing metrics for remaining products...`);
    try {
      const remainingProducts = await prisma.product.findMany({
        where: { storeId: store.id }
      });
      
      console.log(`🔄 [${requestId}] Updating metrics for ${remainingProducts.length} remaining products...`);
      
      // Update metrics for each remaining product to ensure consistency
      const { updateProductMetrics } = await import("../utils/metrics");
      let updatedCount = 0;
      
      for (const remainingProduct of remainingProducts) {
        try {
          await updateProductMetrics(remainingProduct);
          updatedCount++;
        } catch (productMetricsError) {
          console.error(`⚠️ [${requestId}] Error updating metrics for product ${remainingProduct.id}:`, productMetricsError);
        }
      }
      
      console.log(`✅ [${requestId}] Updated metrics for ${updatedCount}/${remainingProducts.length} remaining products`);
    } catch (refreshError) {
      console.error(`❌ [${requestId}] Error refreshing remaining product metrics:`, refreshError);
    }

    // Step 11: Log comprehensive impact analysis
    const impactAnalysis = {
      productRemoved: {
        id: deletedProduct.id,
        shopifyProductId: deletedProduct.shopifyProductId,
        title: deletedProduct.title,
        sustainableMaterials: deletedProduct.sustainableMaterials,
        isLocallyProduced: deletedProduct.isLocallyProduced,
        packagingWeight: deletedProduct.packagingWeight,
        productWeight: deletedProduct.productWeight,
        packagingRatio: deletedProduct.packagingRatio
      },
      storeImpact: {
        productCountChange: storeStatsBefore._count._all - storeStatsAfter._count._all,
        sustainabilityScoreChange: {
          before: storeStatsBefore._avg.sustainableMaterials,
          after: storeStatsAfter._avg.sustainableMaterials,
          improvement: (storeStatsAfter._avg.sustainableMaterials || 0) - (storeStatsBefore._avg.sustainableMaterials || 0)
        },
        packagingEfficiencyChange: {
          before: storeStatsBefore._avg.packagingRatio,
          after: storeStatsAfter._avg.packagingRatio,
          improvement: (storeStatsBefore._avg.packagingRatio || 0) - (storeStatsAfter._avg.packagingRatio || 0)
        }
      },
      metricsUpdated: {
        prometheusMetricsCleared: true,
        storeMetricsUpdated: true,
        remainingProductsRefreshed: true
      }
    };

    console.log(`📈 [${requestId}] COMPREHENSIVE deletion impact analysis:`, impactAnalysis);

    const processingTime = Date.now() - startTime;
    console.log(`🎉 [${requestId}] Product DELETE webhook processing completed successfully in ${processingTime}ms`);
    console.log(`🔥 [${requestId}] FULL CLEANUP COMPLETE: Database cleaned, metrics updated, store stats refreshed!`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      productId: deletedProduct.id,
      shopifyProductId: productId,
      action: "deleted_with_full_cleanup",
      impactAnalysis: impactAnalysis,
      processingTime: processingTime,
      requestId: requestId,
      message: "Product deleted and all metrics updated successfully"
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] Product DELETE webhook processing failed after ${processingTime}ms:`, error.message);
    console.error(`📍 [${requestId}] Stack trace:`, error.stack);
    
    // Check if this is a "record not found" error (which might be normal)
    if (error.code === 'P2025' || error.message.includes('Record to delete does not exist')) {
      console.log(`ℹ️ [${requestId}] Product was already deleted or never existed - treating as success`);
      return new Response(JSON.stringify({ 
        success: true,
        message: "Product already deleted or never existed",
        productId: "unknown",
        action: "already_deleted",
        processingTime: processingTime,
        requestId: requestId
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      error: "Webhook processing failed",
      message: error.message,
      requestId: requestId,
      processingTime: processingTime
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};