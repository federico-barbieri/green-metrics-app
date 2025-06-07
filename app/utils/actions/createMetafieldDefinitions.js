// app/utils/actions/createMetafieldDefinitions.js
import { json } from "@remix-run/node";

export const handleCreateMetafieldDefinitions = async ({ admin }) => {
  try {
    // Create metafield definitions - these define the metadata structure
    const definitionsToCreate = [
      {
        key: "locally_produced",
        name: "Locally produced",
        namespace: "custom",
        ownerType: "PRODUCT",
        type: "boolean",
        description: "Whether the product is locally produced",
      },
      {
        key: "sustainable_materials",
        name: "Sustainable materials",
        namespace: "custom",
        ownerType: "PRODUCT",
        type: "number_decimal",
        description: "Percentage of sustainable materials used (0-1)",
      },
      {
        key: "packaging_weight",
        name: "Packaging weight",
        namespace: "custom",
        ownerType: "PRODUCT",
        type: "number_decimal",
        description: "Weight of product packaging in kg",
      },
      {
        key: "product_weight",
        name: "Product weight",
        namespace: "custom",
        ownerType: "PRODUCT",
        type: "number_decimal",
        description: "Weight of the product in kg",
      },
    ];

    // Create each definition
    const results = [];
    for (const definition of definitionsToCreate) {
      try {
        const mutation = `
          mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const response = await admin.graphql(mutation, {
          variables: {
            definition,
          },
        });

        const responseJson = await response.json();
        results.push(responseJson);
      } catch (err) {
        console.error(
          `Failed to create metafield definition ${definition.key}:`,
          err,
        );
        results.push({ error: err.message, key: definition.key });
      }
    }

    return json({
      action: "create_metafield_definitions",
      success: true,
      message: "Metafield definitions created successfully",
      results,
    });
  } catch (error) {
    console.error("Error creating metafield definitions:", error);
    return json(
      {
        action: "create_metafield_definitions",
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
};