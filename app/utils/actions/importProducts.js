// app/utils/actions/importProducts.js
import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../metrics";
import { updateStoreAggregatedMetrics } from "../storeMetrics";

const prisma = new PrismaClient();

export const handleImportProducts = async ({ admin, session }) => {
  // Get store
  const store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!store) {
    return json({
      action: "import_products",
      success: false,
      error: "Store not found",
    });
  }

  try {
    // Fetch products from Shopify with metafields
    let hasNextPage = true;
    let endCursor = null;
    let importCount = 0;
    let totalProducts = 0;

    while (hasNextPage) {
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

      totalProducts += products.length;

      // Import products
      for (const productEdge of products) {
        const shopifyProduct = productEdge.node;
        const shopifyProductId = shopifyProduct.id.replace(
          "gid://shopify/Product/",
          "",
        );

        // Process metafields
        const metafields = {};
        if (shopifyProduct.metafields && shopifyProduct.metafields.edges) {
          for (const metafieldEdge of shopifyProduct.metafields.edges) {
            const metafield = metafieldEdge.node;
            if (metafield.namespace === "custom") {
              switch (metafield.key) {
                case "sustainable_materials":
                  metafields.sustainableMaterials = parseFloat(
                    metafield.value,
                  );
                  break;
                case "locally_produced":
                  metafields.isLocallyProduced =
                    metafield.value.toLowerCase() === "true";
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
        if (
          metafields.packagingWeight &&
          metafields.productWeight &&
          metafields.productWeight > 0
        ) {
          metafields.packagingRatio =
            metafields.packagingWeight / metafields.productWeight;
        }

        // Check if product already exists
        const existingProduct = await prisma.product.findFirst({
          where: {
            shopifyProductId: shopifyProductId,
            storeId: store.id,
          },
        });

        if (existingProduct) {
          // Update existing product with any new metafields
          const updatedProduct = await prisma.product.update({
            where: {
              id: existingProduct.id,
            },
            data: {
              title: shopifyProduct.title,
              ...metafields,
              updatedAt: new Date(),
            },
          });

          // Update Prometheus metrics for existing product
          await updateProductMetrics(updatedProduct);
        } else {
          // Create new product
          const newProduct = await prisma.product.create({
            data: {
              shopifyProductId: shopifyProductId,
              title: shopifyProduct.title,
              storeId: store.id,
              ...metafields,
            },
          });

          // Update Prometheus metrics for new product
          await updateProductMetrics(newProduct);

          importCount++;
        }

        // Set default metafields for this product if they don't exist
        const metafieldsToSet = [];

        if (
          !shopifyProduct.metafields?.edges.some(
            (edge) => edge.node.key === "locally_produced",
          )
        ) {
          metafieldsToSet.push({
            key: "locally_produced",
            namespace: "custom",
            type: "boolean",
            value: "false",
          });
        }

        if (
          !shopifyProduct.metafields?.edges.some(
            (edge) => edge.node.key === "sustainable_materials",
          )
        ) {
          metafieldsToSet.push({
            key: "sustainable_materials",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
        }

        if (
          !shopifyProduct.metafields?.edges.some(
            (edge) => edge.node.key === "packaging_weight",
          )
        ) {
          metafieldsToSet.push({
            key: "packaging_weight",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
        }

        if (
          !shopifyProduct.metafields?.edges.some(
            (edge) => edge.node.key === "product_weight",
          )
        ) {
          metafieldsToSet.push({
            key: "product_weight",
            namespace: "custom",
            type: "number_decimal",
            value: "0.0",
          });
        }

        // If there are metafields to set for this product
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
            console.error(
              `Error setting default metafields for product ${shopifyProduct.title}:`,
              err,
            );
          }
        }
      }

      // Prepare for next page if necessary
      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
    }

    // Update store-level aggregated metrics after importing all products
    await updateStoreAggregatedMetrics(store.id);

    return json({
      action: "import_products",
      success: true,
      importCount,
      totalProducts,
      message: `Successfully imported ${importCount} products and initialized metrics`,
    });
  } catch (error) {
    console.error("Error importing products:", error);
    return json({
      action: "import_products",
      success: false,
      error: error.message,
    });
  }
};