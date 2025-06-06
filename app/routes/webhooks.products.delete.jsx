// File: app/routes/webhooks.products.delete.jsx

import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);


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


    // Find the product first
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    if (product) {
     
      // Delete product from database
      await prisma.product.delete({
        where: {
          id: product.id,
        },
      });

    } 
  } catch (error) {
    console.error(`Error handling product delete: ${error.message}`);
    console.error(error.stack);
  }

  return new Response();
};
