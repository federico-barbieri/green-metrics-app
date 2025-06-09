// app/utils/actions/syncMissingProducts.js
import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../metrics";
import { updateStoreAggregatedMetrics } from "../storeMetrics";

const prisma = new PrismaClient();

export const handleSyncMissingProducts = async ({ admin, session }) => {
  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!store) {
    return json({
      action: "sync_missing_products",
      success: false,
      error: "Store not found",
    });
  }

  try {

    // Get all DB product IDs for comparison
    const dbProducts = await prisma.product.findMany({
      where: { storeId: store.id },
      select: { shopifyProductId: true }
    });
    const dbProductIds = new Set(dbProducts.map(p => p.shopifyProductId));

    let hasNextPage = true;
    let endCursor = null;
    let syncCount = 0;
    let totalChecked = 0;

    while (hasNextPage && totalChecked < 1000) { // Prevent infinite loops
      const response = await admin.graphql(
        `#graphql
        query GetProductsWithMetafields($cursor: String) {
          products(first: 50, after: $cursor) {
            edges {
              node {
                id
                title
                metafields(first: 10, namespace: "custom") {
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
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        `,
        {
          variables: { cursor: endCursor },
        },
      );

      const responseJson = await response.json();
      const products = responseJson.data.products.edges;
      const pageInfo = responseJson.data.products.pageInfo;

      totalChecked += products.length;

      // Process only missing products
      for (const productEdge of products) {
        const shopifyProduct = productEdge.node;
        const shopifyProductId = shopifyProduct.id.replace(
          "gid://shopify/Product/",
          "",
        );

        // Skip if product already exists in DB
        if (dbProductIds.has(shopifyProductId)) {
          continue;
        }


        // Process metafields (same logic as import_products)
        const metafields = {};
        if (shopifyProduct.metafields && shopifyProduct.metafields.edges) {
          for (const metafieldEdge of shopifyProduct.metafields.edges) {
            const metafield = metafieldEdge.node;
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

        // Calculate packaging ratio
        if (metafields.packagingWeight && metafields.productWeight && metafields.productWeight > 0) {
          metafields.packagingRatio = metafields.packagingWeight / metafields.productWeight;
        }

        // Create the missing product
        const newProduct = await prisma.product.create({
          data: {
            shopifyProductId: shopifyProductId,
            title: shopifyProduct.title,
            storeId: store.id,
            ...metafields,
          },
        });

        // Update Prometheus metrics
        await updateProductMetrics(newProduct);
        syncCount++;

        // Add the new product ID to our set to avoid duplicates
        dbProductIds.add(shopifyProductId);

        // Set default metafields if missing (same logic as import_products)
        const metafieldsToSet = [];

        if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "locally_produced")) {
          metafieldsToSet.push({
            key: "locally_produced",
            namespace: "custom",
            type: "boolean",
            value: "false",
          });
        }

        if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "sustainable_materials")) {
          metafieldsToSet.push({
            key: "sustainable_materials",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
        }

        if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "packaging_weight")) {
          metafieldsToSet.push({
            key: "packaging_weight",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
        }

        if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "product_weight")) {
          metafieldsToSet.push({
            key: "product_weight",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
        }

        // Set default metafields
        if (metafieldsToSet.length > 0) {
          try {
            const mutation = `
              mutation updateProductMetafields($input: ProductInput!) {
                productUpdate(input: $input) {
                  product {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            await admin.graphql(mutation, {
              variables: {
                input: {
                  id: shopifyProduct.id,
                  metafields: metafieldsToSet,
                },
              },
            });
          } catch (err) {
            console.error(`Error setting metafields for ${shopifyProduct.title}:`, err);
          }
        }
      }

      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
    }

    // Update store-level metrics after sync
    await updateStoreAggregatedMetrics(store.id);


    return json({
      action: "sync_missing_products",
      success: true,
      syncCount,
      totalChecked,
      message: `Successfully synced ${syncCount} missing products`,
    });

  } catch (error) {
    console.error("Error syncing missing products:", error);
    return json({
      action: "sync_missing_products",
      success: false,
      error: error.message,
    });
  }
};