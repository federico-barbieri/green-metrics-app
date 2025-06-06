// File: app/routes/webhooks.products.create.jsx - Debugged version

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics"; // Import metrics utility

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  console.log("🚀 Product create webhook triggered");
  
  try {
    const { shop, payload, admin } = await authenticate.webhook(request);
    
    console.log("✅ Webhook authenticated for shop:", shop);
    console.log("📦 Product payload:", {
      id: payload.id,
      title: payload.title,
      status: payload.status,
      metafields_count: payload.metafields ? payload.metafields.length : 0
    });

    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!store) {
      console.error(`❌ Store not found: ${shop}`);
      // List all stores for debugging
      const allStores = await prisma.store.findMany({
        select: { shopifyDomain: true, id: true }
      });
      console.log("📋 Available stores:", allStores);
      return new Response(JSON.stringify({ error: "Store not found" }), { status: 404 });
    }

    console.log("✅ Store found:", store.shopifyDomain, "ID:", store.id);

    // Extract product data from webhook payload
    const productId = payload.id.toString();
    const productTitle = payload.title;

    console.log("🔍 Processing product:", productId, "-", productTitle);

    // Check if product already exists
    const existingProduct = await prisma.product.findUnique({
      where: {
        shopifyProductId_storeId: {
          shopifyProductId: productId,
          storeId: store.id
        }
      }
    });

    if (existingProduct) {
      console.log("⚠️ Product already exists in database:", existingProduct.id);
      return new Response(JSON.stringify({ message: "Product already exists" }), { status: 200 });
    }

    // Extract metafields (if available)
    const metafields = {};
    console.log("🔍 Checking metafields...");

    if (payload.metafields && payload.metafields.length > 0) {
      console.log("📝 Found metafields:", payload.metafields);
      
      for (const metafield of payload.metafields) {
        if (metafield.namespace === "custom") {
          console.log(`Processing metafield: ${metafield.key} = ${metafield.value}`);
          
          switch (metafield.key) {
            case "sustainable_materials":
              metafields.sustainableMaterials = parseFloat(metafield.value);
              break;
            case "locally_produced":
              metafields.isLocallyProduced = metafield.value.toLowerCase() === "true";
              break;
            case "packaging_weight":
              metafields.packagingWeight = parseFloat(metafield.value);
              break;
            case "product_weight":
              metafields.productWeight = parseFloat(metafield.value);
              break;
          }
        }
      }
    } else {
      console.log("📝 No metafields found in payload");
    }

    console.log("📊 Extracted metafields:", metafields);

    // Calculate packaging ratio if both weights are available
    if (metafields.packagingWeight && metafields.productWeight && metafields.productWeight > 0) {
      metafields.packagingRatio = metafields.packagingWeight / metafields.productWeight;
      console.log("📏 Calculated packaging ratio:", metafields.packagingRatio);
    }

    // Check if product has all needed metafields, if not, set default values
    const hasAllMetafields =
      metafields.hasOwnProperty("isLocallyProduced") &&
      metafields.hasOwnProperty("sustainableMaterials") &&
      metafields.hasOwnProperty("packagingWeight") &&
      metafields.hasOwnProperty("productWeight");

    console.log("🔧 Has all metafields:", hasAllMetafields);

    // If metafields are missing, add them automatically
    if (!hasAllMetafields) {
      console.log("➕ Adding missing metafields...");

      try {
        const metafieldsToAdd = [];

        // Only add metafields that don't exist
        if (!metafields.hasOwnProperty("isLocallyProduced")) {
          metafieldsToAdd.push({
            key: "locally_produced",
            namespace: "custom",
            type: "boolean",
            value: "false",
          });
          metafields.isLocallyProduced = false;
        }

        if (!metafields.hasOwnProperty("sustainableMaterials")) {
          metafieldsToAdd.push({
            key: "sustainable_materials",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
          metafields.sustainableMaterials = 0;
        }

        if (!metafields.hasOwnProperty("packagingWeight")) {
          metafieldsToAdd.push({
            key: "packaging_weight",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
          metafields.packagingWeight = 0;
        }

        if (!metafields.hasOwnProperty("productWeight")) {
          metafieldsToAdd.push({
            key: "product_weight",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
          metafields.productWeight = 0;
        }

        console.log("📋 Metafields to add:", metafieldsToAdd);

        if (metafieldsToAdd.length > 0) {
          const mutation = `
            mutation updateProductMetafields($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  metafields(first: 10) {
                    edges {
                      node {
                        namespace
                        key
                        value
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          console.log("🔄 Updating product with metafields...");

          const response = await admin.graphql(mutation, {
            variables: {
              input: {
                id: `gid://shopify/Product/${productId}`,
                metafields: metafieldsToAdd,
              },
            },
          });

          const responseJson = await response.json();
          console.log("📨 GraphQL response:", JSON.stringify(responseJson, null, 2));

          // Check for user errors
          const userErrors = responseJson.data?.productUpdate?.userErrors;
          if (userErrors && userErrors.length > 0) {
            const errorMessages = userErrors.map((e) => e.message).join(", ");
            console.error(`❌ Error setting metafields for product ${productTitle}: ${errorMessages}`);
          } else {
            console.log("✅ Metafields updated successfully");
          }
        }
      } catch (error) {
        console.error(`❌ Error setting metafields for product ${productTitle}:`, error);
      }
    }

    console.log("💾 Creating product in database...");

    // Create product in database
    const newProduct = await prisma.product.create({
      data: {
        shopifyProductId: productId,
        title: productTitle,
        storeId: store.id,
        sustainableMaterials: metafields.sustainableMaterials || 0,
        isLocallyProduced: metafields.isLocallyProduced || false,
        packagingWeight: metafields.packagingWeight || 0,
        productWeight: metafields.productWeight || 0,
        packagingRatio: metafields.packagingRatio || 0,
      },
    });

    console.log("✅ Product created in database:", newProduct.id);

    // Update metrics in Prometheus
    console.log("📊 Updating Prometheus metrics...");
    try {
      await updateProductMetrics(newProduct);
      console.log("✅ Prometheus metrics updated successfully");
    } catch (metricsError) {
      console.error("❌ Error updating Prometheus metrics:", metricsError);
      // Don't fail the webhook if metrics update fails
    }

    console.log("🎉 Product webhook processing completed successfully");
    
    return new Response(JSON.stringify({ 
      success: true, 
      productId: newProduct.id,
      shopifyProductId: productId
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`❌ Error handling product create webhook:`, error.message);
    console.error("📍 Stack trace:", error.stack);
    
    return new Response(JSON.stringify({ 
      error: "Webhook processing failed",
      message: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};