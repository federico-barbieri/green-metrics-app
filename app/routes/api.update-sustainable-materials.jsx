// app/routes/api.update-sustainable-materials.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics";


const prisma = new PrismaClient();

// This is the action function that will be called when the form is submitted
// It updates the sustainable materials metafield for a product
// It uses the Shopify GraphQL API to perform the update
// It expects a JSON body with the productId and the new value for the sustainable_materials metafield
// It returns a JSON response indicating success or failure
export const action = async ({ request }) => {
  console.log("Action started");
  try {
    const { admin, session } = await authenticate.admin(request);
    const body = await request.json();

    console.log("Received update request:", body);
    const { productId, sustainable_materials } = body;

    const formatAndClamp = (val) => {
      let num = parseFloat(val);
      
      // Handle invalid input
      if (isNaN(num)) return null;
      
      // Enforce min/max constraints
      if (num > 1) num = 1;
      
      // Minimum of 0
      if (num < 0) num = 0;
      
      // Format to 2 decimal places
      return num.toFixed(2);
    };

    const formattedSustainableMaterials = formatAndClamp(sustainable_materials);

    if (formattedSustainableMaterials === null) {
      return json({ 
        success: false, 
        error: "Invalid number input. Values must be between 0 and 1." 
      }, { status: 400 });
    }
    console.log("Formatted sustainable materials:", { formattedSustainableMaterials });

    // 1. Update the metafield in Shopify
    const mutation = `
      mutation {
        productUpdate(input: {
          id: "${productId}",
          metafields: [
            {
              namespace: "custom",
              key: "sustainable_materials",
              value: "${formattedSustainableMaterials}",
              type: "number_decimal"
            },
          ]
        }) {
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

    const res = await admin.graphql(mutation);
    const jsonRes = await res.json();

    if (jsonRes.data?.productUpdate?.userErrors?.length > 0) {
      const errors = jsonRes.data.productUpdate.userErrors;
      console.log("GraphQL errors:", errors);
      return json({ 
        success: false, 
        errors,
        error: errors.map(e => e.message).join(", ")
      }, { status: 400 });
    }

    // Log the updated metafields to verify they were correctly set
    if (jsonRes.data?.productUpdate?.product?.metafields) {
      console.log("Updated product metafields:", 
        jsonRes.data.productUpdate.product.metafields.edges.map(e => ({
          namespace: e.node.namespace,
          key: e.node.key,
          value: e.node.value
        }))
      );
    }

    // 2. Also update the local database
    // Extract the numeric ID from the Shopify GID
    const shopifyProductId = productId.replace('gid://shopify/Product/', '');
    
    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop }
    });
    
    if (!store) {
      return json({ 
        success: true, // Still succeeded in Shopify
        shopifyUpdated: true,
        databaseUpdated: false,
        error: "Store not found in database",
        sustainable_materials: formattedSustainableMaterials 
      });
    }
    
    // Find and update the product in our database
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: shopifyProductId,
        storeId: store.id
      }
    });
    
    if (product) {
      // Parse as float for database
      const sustainableValue = parseFloat(formattedSustainableMaterials);
      
      const updatedProduct = await prisma.product.update({
        where: {
          id: product.id
        },
        data: {
          sustainableMaterials: sustainableValue,
          updatedAt: new Date()
        }
      });
      
      console.log("Product updated in database:", updatedProduct);

      // Update metrics in Prometheus
      await updateProductMetrics(updatedProduct);
      console.log("Metrics updated for product:", shopifyProductId);
      
    } else {
      console.log(`Product not found in database: ${shopifyProductId}`);
      return json({ 
        success: true,
        shopifyUpdated: true,
        databaseUpdated: false,
        message: "Product updated in Shopify but not found in local database",
        sustainable_materials: formattedSustainableMaterials
      });
    }

    console.log("Metafields and database updated successfully");
    return json({ 
      success: true,
      shopifyUpdated: true,
      databaseUpdated: true,
      productId,
      sustainable_materials: formattedSustainableMaterials
    });
  } catch (error) {
    console.error("Error in action:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};