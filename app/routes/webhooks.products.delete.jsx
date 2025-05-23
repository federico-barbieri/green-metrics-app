// File: app/routes/webhooks.products.delete.jsx

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { markProductDeleted } from "../utils/metrics"; // Import the metrics marking function

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!store) {
      console.error(`Store not found: ${shop}`);
      return new Response();
    }

    // Extract product ID
    const productId = payload.id.toString();

    console.log(`Deleting product: ${productId}`);

    // Find the product first
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    if (product) {
      // Mark product as deleted in Prometheus but keep the metrics data
      await markProductDeleted(product);
      console.log(`Marked product as deleted in metrics: ${productId}`);

      // Delete product from database
      await prisma.product.delete({
        where: {
          id: product.id,
        },
      });

      console.log(`Product deleted: ${productId} for store: ${shop}`);
    } else {
      console.log(`Product not found for deletion: ${productId}`);
    }
  } catch (error) {
    console.error(`Error handling product delete: ${error.message}`);
    console.error(error.stack);
  }

  return new Response();
};
