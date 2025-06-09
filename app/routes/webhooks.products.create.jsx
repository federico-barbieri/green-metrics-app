// File: app/routes/webhooks.products.create.jsx - Debugged version

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics"; // Import metrics utility

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  
  try {
    const { shop, payload, admin } = await authenticate.webhook(request);
    
   

    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!store) {
      console.error(` Store not found: ${shop}`);
      
      return new Response(JSON.stringify({ error: "Store not found" }), { status: 404 });
    }


    // Extract product data from webhook payload
    const productId = payload.id.toString();
    const productTitle = payload.title;


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
      return new Response(JSON.stringify({ message: "Product already exists" }), { status: 200 });
    }

    // Extract metafields (if available)
    const metafields = {};

    if (payload.metafields && payload.metafields.length > 0) {
      
      for (const metafield of payload.metafields) {
        if (metafield.namespace === "custom") {
          
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
    } 


    // Calculate packaging ratio if both weights are available
    if (metafields.packagingWeight && metafields.productWeight && metafields.productWeight > 0) {
      metafields.packagingRatio = metafields.packagingWeight / metafields.productWeight;
    }

    // Check if product has all needed metafields, if not, set default values
    const hasAllMetafields =
      metafields.hasOwnProperty("isLocallyProduced") &&
      metafields.hasOwnProperty("sustainableMaterials") &&
      metafields.hasOwnProperty("packagingWeight") &&
      metafields.hasOwnProperty("productWeight");


    // If metafields are missing, add them automatically
    if (!hasAllMetafields) {

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


          const response = await admin.graphql(mutation, {
            variables: {
              input: {
                id: `gid://shopify/Product/${productId}`,
                metafields: metafieldsToAdd,
              },
            },
          });

          const responseJson = await response.json();

          // Check for user errors
          const userErrors = responseJson.data?.productUpdate?.userErrors;
          if (userErrors && userErrors.length > 0) {
            const errorMessages = userErrors.map((e) => e.message).join(", ");
            console.error(` Error setting metafields for product ${productTitle}: ${errorMessages}`);
          } 
        }
      } catch (error) {
        console.error(` Error setting metafields for product ${productTitle}:`, error);
      }
    }


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


    // Update metrics in Prometheus
    try {
      await updateProductMetrics(newProduct);
    } catch (metricsError) {
      console.error(" Error updating Prometheus metrics:", metricsError);
      // Don't fail the webhook if metrics update fails
    }

    
    return new Response(JSON.stringify({ 
      success: true, 
      productId: newProduct.id,
      shopifyProductId: productId
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(` Error handling product create webhook:`, error.message);
    console.error(" Stack trace:", error.stack);
    
    return new Response(JSON.stringify({ 
      error: "Webhook processing failed",
      message: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};