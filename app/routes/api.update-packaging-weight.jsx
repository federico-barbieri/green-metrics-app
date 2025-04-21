// app/routes/api.update-packaging-weight.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// This is the action function that will be called when the form is submitted
// It updates the packaging-weight metafield for a product
// It uses the Shopify GraphQL API to perform the update
// It expects a JSON body with the productId and the new value for the packaging_weight metafield
// and/or the product_weight metafield
// It returns a JSON response indicating success or failure
export const action = async ({ request }) => {
  console.log("Action started");
  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();

    console.log("Received update request:", body);
    const { productId, product_weight, packaging_weight } = body;

    const formatAndClamp = (val) => {
      let num = parseFloat(val);
      
      // Handle invalid input
      if (isNaN(num)) return null;
      
      // Enforce min/max constraints
      if (num > 10) num = 10;
      
      // Minimum of 1g (0.001kg) if not zero
      // The zero check allows for products that don't exist yet
      if (num < 0.001 && num !== 0) num = 0.001;
      
      // Format to 3 decimal places (g precision in kg)
      return num.toFixed(3);
    };

    const formattedProductWeight = formatAndClamp(product_weight);
    const formattedPackagingWeight = formatAndClamp(packaging_weight);

    if (formattedProductWeight === null || formattedPackagingWeight === null) {
      return json({ 
        success: false, 
        error: "Invalid number input. Values must be between 0.001 and 10." 
      }, { status: 400 });
    }

    console.log("Formatted weights:", { formattedProductWeight, formattedPackagingWeight });

    const mutation = `
      mutation {
        productUpdate(input: {
          id: "${productId}",
          metafields: [
            {
              namespace: "custom",
              key: "product_weight",
              value: "${formattedProductWeight}",
              type: "number_decimal"
            },
            {
              namespace: "custom",
              key: "packaging_weight",
              value: "${formattedPackagingWeight}",
              type: "number_decimal"
            }
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

    console.log("Metafields updated successfully");
    return json({ 
      success: true,
      product_weight: formattedProductWeight,
      packaging_weight: formattedPackagingWeight 
    });
  } catch (error) {
    console.error("Error in action:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};