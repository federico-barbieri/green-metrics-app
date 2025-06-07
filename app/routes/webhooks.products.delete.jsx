// app/routes/webhooks.products.delete.jsx - With detailed debugging
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateStoreAggregatedMetrics } from "../utils/storeMetrics"; // Update store metrics after deletion

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
        message: "Product not found in database",
        productId: productId,
        action: "no_action_needed"
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

    // Step 6: Delete product from database
    console.log(`🗑️ [${requestId}] Deleting product from database...`);
    
    const deletedProduct = await prisma.product.delete({
      where: {
        id: product.id,
      },
    });

    console.log(`✅ [${requestId}] Product successfully deleted from database: ${deletedProduct.id}`);

    // Step 7: Get store stats after deletion
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

    // Step 8: Update store-level aggregated metrics
    console.log(`📊 [${requestId}] Updating store-level aggregated metrics...`);
    try {
      await updateStoreAggregatedMetrics(store.id);
      console.log(`✅ [${requestId}] Store-level metrics updated successfully`);
    } catch (metricsError) {
      console.error(`❌ [${requestId}] Error updating store metrics:`, metricsError);
      // Don't fail the webhook if metrics update fails
    }

    // Step 9: Log impact analysis
    const impactAnalysis = {
      productRemoved: {
        id: deletedProduct.id,
        title: deletedProduct.title,
        sustainableMaterials: deletedProduct.sustainableMaterials,
        isLocallyProduced: deletedProduct.isLocallyProduced
      },
      storeImpact: {
        productCountChange: storeStatsBefore._count._all - storeStatsAfter._count._all,
        sustainabilityScoreChange: {
          before: storeStatsBefore._avg.sustainableMaterials,
          after: storeStatsAfter._avg.sustainableMaterials
        }
      }
    };

    console.log(`📈 [${requestId}] Deletion impact analysis:`, impactAnalysis);

    const processingTime = Date.now() - startTime;
    console.log(`🎉 [${requestId}] Product DELETE webhook processing completed successfully in ${processingTime}ms`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      productId: deletedProduct.id,
      shopifyProductId: productId,
      action: "deleted",
      impactAnalysis: impactAnalysis,
      processingTime: processingTime,
      requestId: requestId
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