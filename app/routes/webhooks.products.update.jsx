// app/routes/webhooks.products.update.jsx
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics"; // Import metrics utility

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

    // Extract product data
    const productId = payload.id.toString();
    const productTitle = payload.title;

    // Extract metafields (if available)
    const metafields = {};

    if (payload.metafields) {
      for (const metafield of payload.metafields) {
        if (metafield.namespace === "custom") {
          switch (metafield.key) {
            case "sustainable_materials":
              metafields.sustainableMaterials = parseFloat(metafield.value);
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

    // Find the product
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    let updatedProduct;

    if (product) {
      // Update existing product
      updatedProduct = await prisma.product.update({
        where: {
          id: product.id,
        },
        data: {
          title: productTitle,
          ...metafields,
          updatedAt: new Date(),
        },
      });

    } else {
      // If product doesn't exist yet, create it
      updatedProduct = await prisma.product.create({
        data: {
          shopifyProductId: productId,
          title: productTitle,
          storeId: store.id,
          ...metafields,
        },
      });

    }

    // Update metrics in Prometheus after DB update
    if (updatedProduct) {
      await updateProductMetrics(updatedProduct);
    }
  } catch (error) {
    console.error(`Error handling product update: ${error.message}`);
    console.error(error.stack);
  }

  return new Response();
};
