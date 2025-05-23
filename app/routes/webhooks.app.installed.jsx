// File: app/routes/webhooks.app.installed.jsx

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      console.log(`Importing products for ${shop}`);

      // First, get or create the store record
      let store = await prisma.store.findUnique({
        where: { shopifyDomain: shop },
      });

      if (!store) {
        store = await prisma.store.create({
          data: {
            shopifyDomain: shop,
            name: shop.split(".")[0], // Basic name from domain
          },
        });
        console.log(`Created store record for ${shop}`);
      }

      // Use Admin API to fetch products
      const { admin } = session;
      let hasNextPage = true;
      let endCursor = null;
      let totalImported = 0;

      while (hasNextPage) {
        // GraphQL query to fetch products in batches
        const response = await admin.graphql(
          `#graphql
          query GetProducts($cursor: String) {
            products(first: 50, after: $cursor) {
              edges {
                node {
                  id
                  title
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

        console.log(`Processing batch of ${products.length} products`);

        // Process and save products
        for (const productEdge of products) {
          const shopifyProduct = productEdge.node;
          const shopifyProductId = shopifyProduct.id.replace(
            "gid://shopify/Product/",
            "",
          );

          // Check if product already exists
          const existingProduct = await prisma.product.findFirst({
            where: {
              shopifyProductId: shopifyProductId,
              storeId: store.id,
            },
          });

          if (!existingProduct) {
            // Create new product
            await prisma.product.create({
              data: {
                shopifyProductId: shopifyProductId,
                title: shopifyProduct.title,
                storeId: store.id,
              },
            });
            totalImported++;
          }
        }

        // Check if there are more products to fetch
        hasNextPage = pageInfo.hasNextPage;
        endCursor = pageInfo.endCursor;
      }

      console.log(
        `Successfully imported ${totalImported} products for store: ${shop}`,
      );
    } catch (error) {
      console.error(`Error importing products: ${error.message}`);
      console.error(error.stack);
    }
  }

  return new Response();
};
