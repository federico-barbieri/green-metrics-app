// app/routes/api.update-locally-produced.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const body = await request.json();

    const { productId, locally_produced } = body;

    if (typeof locally_produced !== "boolean") {
      return json(
        { success: false, error: "Invalid boolean input" },
        { status: 400 },
      );
    }

    // 1. Update metafield in Shopify
    const mutation = `
      mutation {
        productUpdate(input: {
          id: "${productId}",
          metafields: [
            {
              namespace: "custom",
              key: "locally_produced",
              value: "${locally_produced}",
              type: "boolean"
            }
          ]
        }) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const res = await admin.graphql(mutation);
    const jsonRes = await res.json();

    if (jsonRes.data?.productUpdate?.userErrors?.length > 0) {
      return json(
        { success: false, errors: jsonRes.data.productUpdate.userErrors },
        { status: 400 },
      );
    }

    // 2. Also update the local database
    // Extract the numeric ID from the Shopify GID
    const shopifyProductId = productId.replace("gid://shopify/Product/", "");

    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
    });

    if (!store) {
      return json(
        {
          success: false,
          error: "Store not found in database",
        },
        { status: 500 },
      );
    }

    // Find and update the product in the database
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: shopifyProductId,
        storeId: store.id,
      },
    });

    if (product) {
      const updatedProduct = await prisma.product.update({
        where: {
          id: product.id,
        },
        data: {
          isLocallyProduced: locally_produced,
          updatedAt: new Date(),
        },
      });


      // Update metrics in Prometheus
      await updateProductMetrics(updatedProduct);
    } else {
      return json({
        success: true,
        shopifyUpdated: true,
        databaseUpdated: false,
        message: "Product updated in Shopify but not found in local database",
      });
    }

    return json({
      success: true,
      shopifyUpdated: true,
      databaseUpdated: true,
    });
  } catch (error) {
    console.error("Error in action:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};
