// File: app/routes/webhooks.app.installed.jsx

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const { shop, session } = await authenticate.webhook(request);


  if (session) {
    try {

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
      }

      // Use Admin API to fetch products
      const { admin } = session;
      let hasNextPage = true;
      let endCursor = null;

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
          }
        }

        // Check if there are more products to fetch
        hasNextPage = pageInfo.hasNextPage;
        endCursor = pageInfo.endCursor;
      }
    } catch (error) {
      console.error(`Error importing products: ${error.message}`);
      console.error(error.stack);
    }
  }

  return new Response();
};
