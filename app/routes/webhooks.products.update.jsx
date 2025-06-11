// app/routes/webhooks.products.update.jsx - With detailed debugging
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    // Step 1: Authenticate webhook
    const { shop, payload, admin } = await authenticate.webhook(request);
    
    

    // Step 2: Find store in database
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!store) {
      console.error(`❌ [${requestId}] Store not found: ${shop}`);
      
      // Debug: List all stores
      const allStores = await prisma.store.findMany({
        select: { shopifyDomain: true, id: true, name: true }
      });
      
      return new Response(JSON.stringify({ 
        error: "Store not found",
        shop: shop,
        available_stores: allStores.map(s => s.shopifyDomain)
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }


    // Step 3: Extract and validate product data
    const productId = payload.id.toString();
    const productTitle = payload.title;
    

    // Step 4: Check if product exists in our database
    const existingProduct = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    
    

    // Step 5: Process metafields from payload
    const metafields = {};

    if (payload.metafields && payload.metafields.length > 0) {
      
      for (const metafield of payload.metafields) {
        if (metafield.namespace === "custom") {
          
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
      
      // Fetch metafields from Shopify if not in payload
      try {
        
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
        
        if (metafieldData.data?.product?.metafields?.edges) {
          for (const edge of metafieldData.data.product.metafields.edges) {
            const metafield = edge.node;
            
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


    // Step 6: Calculate derived values
    if (metafields.packagingWeight && metafields.productWeight && metafields.productWeight > 0) {
      metafields.packagingRatio = metafields.packagingWeight / metafields.productWeight;
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
      }
    }

    // Step 8: Update or create product in database
    let updatedProduct;

    if (existingProduct) {
      
      // Show what's changing
      const changes = {};
      if (existingProduct.title !== productTitle) changes.title = { from: existingProduct.title, to: productTitle };
      if (existingProduct.sustainableMaterials !== metafields.sustainableMaterials) changes.sustainableMaterials = { from: existingProduct.sustainableMaterials, to: metafields.sustainableMaterials };
      if (existingProduct.isLocallyProduced !== metafields.isLocallyProduced) changes.isLocallyProduced = { from: existingProduct.isLocallyProduced, to: metafields.isLocallyProduced };
      if (existingProduct.packagingWeight !== metafields.packagingWeight) changes.packagingWeight = { from: existingProduct.packagingWeight, to: metafields.packagingWeight };
      if (existingProduct.productWeight !== metafields.productWeight) changes.productWeight = { from: existingProduct.productWeight, to: metafields.productWeight };
      
      

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

    } else {
      
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

    }

    // Step 9: Update metrics
    try {
      await updateProductMetrics(updatedProduct);
    } catch (metricsError) {
      console.error(` [${requestId}] Error updating Prometheus metrics:`, metricsError);
      // Don't fail the webhook if metrics update fails
    }

    const processingTime = Date.now() - startTime;
    
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
    console.error(` [${requestId}] Product UPDATE webhook processing failed after ${processingTime}ms:`, error.message);
    console.error(` [${requestId}] Stack trace:`, error.stack);
    
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