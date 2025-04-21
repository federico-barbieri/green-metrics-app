// app/routes/api.update-locally-produced.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// This is the action function that will be called when the form is submitted
// It updates the locally_produced metafield for a product
// It uses the Shopify GraphQL API to perform the update
// It expects a JSON body with the productId and the new value for the locally_produced metafield
// It returns a JSON response indicating success or failure
export const action = async ({ request }) => {
  console.log("Action started");
  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();

    const { productId,locally_produced } = body;

    if (typeof locally_produced !== "boolean") {
      return json({ success: false, error: "Invalid boolean input" }, { status: 400 });
    }

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
            },
          ]
        }) {
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

    const res = await admin.graphql(mutation);
    const jsonRes = await res.json();
    console.log("Current metafield values:", await JSON.stringify(jsonRes, null, 2));


    if (jsonRes.data?.productUpdate?.userErrors?.length > 0) {
      console.log("GraphQL errors:", jsonRes.data.productUpdate.userErrors);
      return json({ success: false, errors: jsonRes.data.productUpdate.userErrors }, { status: 400 });
    }

    console.log("Metafields updated successfully");
    return json({ success: true });
  } catch (error) {
    console.error("Error in action:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};
