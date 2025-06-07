// app/routes/webhooks.products.update.jsx - With detailed debugging
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`🔄 [${requestId}] Product UPDATE webhook triggered at ${new Date().toISOString()}`);
  console.log(`📋 [${requestId}] Request URL: ${request.url}`);
  console.log(`📋 [${requestId}] Request method: ${request.method}`);
  
  // Log all headers for debugging
  const headers = Object.fromEntries(request.headers.entries());
  console.log(`📋 [${requestId}] Headers:`, JSON.stringify(headers, null, 2));

  try {
    // Step 1: Authenticate webhook
    console.log(`🔐 [${requestId}] Authenticating webhook...`);
    const { shop, payload, admin } = await authenticate.webhook(request);
    
    console.log(`✅ [${requestId}] Webhook authenticated for shop: ${shop}`);
    console.log(`📦 [${requestId}] Product UPDATE payload:`, {
      id: payload.id,
      title: payload.title,
      status: payload.status,
      updated_at: payload.updated_at,
      metafields_count: payload.metafields ? payload.metafields.length : 0
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

    // Step 3: Extract and validate product data
    const productId = payload.id.toString();
    const productTitle = payload.title;
    
    console.log(`🔍 [${requestId}] Processing product UPDATE: ${productId} - "${productTitle}"`);

    // Step 4: Check if product exists in our database
    const existingProduct = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    if (existingProduct) {
      console.log(`✅ [${requestId}] Found existing product in database: ${existingProduct.id}`);
      console.log(`📊 [${requestId}] Current product data:`, {
        title: existingProduct.title,
        sustainableMaterials: existingProduct.sustainableMaterials,
        isLocallyProduced: existingProduct.isLocallyProduced,
        packagingWeight: existingProduct.packagingWeight,
        productWeight: existingProduct.productWeight
      });
    } else {
      console.log(`⚠️ [${requestId}] Product not found in database - will create new record`);
    }

    // Step 5: Process metafields from payload
    const metafields = {};
    console.log(`🔍 [${requestId}] Processing metafields from payload...`);

    if (payload.metafields && payload.metafields.length > 0) {
      console.log(`📝 [${requestId}] Found ${payload.metafields.length} metafields in payload:`, payload.metafields);
      
      for (const metafield of payload.metafields) {
        if (metafield.namespace === "custom") {
          console.log(`📝 [${requestId}] Processing metafield: ${metafield.key} = ${metafield.value}`);
          
          switch (metafield.key) {
            case "sustainable_materials":
              metafields.sustainableMaterials = parseFloat(metafield.value) || 0;
              break;
            case "locally_produced":
              metafields.isLocallyProduced = metafield.value.toLowerCase() === "true";
              break;
            case "packaging_weight":
              metafields.packagingWeight = parseFloat(metafield.value) || 0;
              break;
            case "product_weight":
              metafields.productWeight = parseFloat(metafield.value) || 0;
              break;
          }
        }
      }
    } else {
      console.log(`📝 [${requestId}] No metafields in payload - will fetch from Shopify`);
      
      // Fetch metafields from Shopify if not in payload
      try {
        console.log(`🔄 [${requestId}] Fetching product metafields from Shopify...`);
        
        const metafieldResponse = await admin.graphql(`
          query getProductMetafields($id: ID!) {
            product(id: $id) {
              metafields(namespace: "custom", first: 20) {
                edges {
                  node {
                    key
                    value
                    namespace
                  }
                }
              }
            }
          }
        `, {
          variables: { id: `gid://shopify/Product/${productId}` }
        });

        const metafieldData = await metafieldResponse.json();
        console.log(`📊 [${requestId}] Fetched metafields:`, JSON.stringify(metafieldData, null, 2));
        
        if (metafieldData.data?.product?.metafields?.edges) {
          for (const edge of metafieldData.data.product.metafields.edges) {
            const metafield = edge.node;
            console.log(`📝 [${requestId}] Processing fetched metafield: ${metafield.key} = ${metafield.value}`);
            
            switch (metafield.key) {
              case "sustainable_materials":
                metafields.sustainableMaterials = parseFloat(metafield.value) || 0;
                break;
              case "locally_produced":
                metafields.isLocallyProduced = metafield.value.toLowerCase() === "true";
                break;
              case "packaging_weight":
                metafields.packagingWeight = parseFloat(metafield.value) || 0;
                break;
              case "product_weight":
                metafields.productWeight = parseFloat(metafield.value) || 0;
                break;
            }
          }
        }
      } catch (metafieldError) {
        console.error(`❌ [${requestId}] Error fetching metafields:`, metafieldError);
      }
    }

    console.log(`📊 [${requestId}] Extracted metafields:`, metafields);

    // Step 6: Calculate derived values
    if (metafields.packagingWeight && metafields.productWeight && metafields.productWeight > 0) {
      metafields.packagingRatio = metafields.packagingWeight / metafields.productWeight;
      console.log(`📏 [${requestId}] Calculated packaging ratio: ${metafields.packagingRatio}`);
    }

    // Step 7: Set defaults for missing metafields
    const defaultMetafields = {
      sustainableMaterials: 0,
      isLocallyProduced: false,
      packagingWeight: 0,
      productWeight: 0
    };

    for (const [key, defaultValue] of Object.entries(defaultMetafields)) {
      if (!metafields.hasOwnProperty(key)) {
        metafields[key] = defaultValue;
        console.log(`🔧 [${requestId}] Set default ${key}: ${defaultValue}`);
      }
    }

    // Step 8: Update or create product in database
    let updatedProduct;

    if (existingProduct) {
      console.log(`💾 [${requestId}] Updating existing product in database...`);
      
      // Show what's changing
      const changes = {};
      if (existingProduct.title !== productTitle) changes.title = { from: existingProduct.title, to: productTitle };
      if (existingProduct.sustainableMaterials !== metafields.sustainableMaterials) changes.sustainableMaterials = { from: existingProduct.sustainableMaterials, to: metafields.sustainableMaterials };
      if (existingProduct.isLocallyProduced !== metafields.isLocallyProduced) changes.isLocallyProduced = { from: existingProduct.isLocallyProduced, to: metafields.isLocallyProduced };
      if (existingProduct.packagingWeight !== metafields.packagingWeight) changes.packagingWeight = { from: existingProduct.packagingWeight, to: metafields.packagingWeight };
      if (existingProduct.productWeight !== metafields.productWeight) changes.productWeight = { from: existingProduct.productWeight, to: metafields.productWeight };
      
      if (Object.keys(changes).length > 0) {
        console.log(`🔄 [${requestId}] Changes detected:`, changes);
      } else {
        console.log(`➡️ [${requestId}] No significant changes detected`);
      }

      updatedProduct = await prisma.product.update({
        where: {
          id: existingProduct.id,
        },
        data: {
          title: productTitle,
          sustainableMaterials: metafields.sustainableMaterials,
          isLocallyProduced: metafields.isLocallyProduced,
          packagingWeight: metafields.packagingWeight,
          productWeight: metafields.productWeight,
          packagingRatio: metafields.packagingRatio || 0,
          updatedAt: new Date(),
        },
      });

      console.log(`✅ [${requestId}] Product updated in database: ${updatedProduct.id}`);
    } else {
      console.log(`💾 [${requestId}] Creating new product in database...`);
      
      updatedProduct = await prisma.product.create({
        data: {
          shopifyProductId: productId,
          title: productTitle,
          storeId: store.id,
          sustainableMaterials: metafields.sustainableMaterials,
          isLocallyProduced: metafields.isLocallyProduced,
          packagingWeight: metafields.packagingWeight,
          productWeight: metafields.productWeight,
          packagingRatio: metafields.packagingRatio || 0,
        },
      });

      console.log(`✅ [${requestId}] New product created in database: ${updatedProduct.id}`);
    }

    // Step 9: Update metrics
    console.log(`📊 [${requestId}] Updating Prometheus metrics...`);
    try {
      await updateProductMetrics(updatedProduct);
      console.log(`✅ [${requestId}] Prometheus metrics updated successfully`);
    } catch (metricsError) {
      console.error(`❌ [${requestId}] Error updating Prometheus metrics:`, metricsError);
      // Don't fail the webhook if metrics update fails
    }

    const processingTime = Date.now() - startTime;
    console.log(`🎉 [${requestId}] Product UPDATE webhook processing completed successfully in ${processingTime}ms`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      productId: updatedProduct.id,
      shopifyProductId: productId,
      action: existingProduct ? "updated" : "created",
      processingTime: processingTime,
      requestId: requestId
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] Product UPDATE webhook processing failed after ${processingTime}ms:`, error.message);
    console.error(`📍 [${requestId}] Stack trace:`, error.stack);
    
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