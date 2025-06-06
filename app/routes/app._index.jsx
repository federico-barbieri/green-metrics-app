// app/routes/app._index.jsx - Complete file with enhanced product sync
import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Banner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics";
import { updateStoreAggregatedMetrics } from "../utils/storeMetrics";

const prisma = new PrismaClient();

// PDF Download Component
function SustainabilityReportDownload() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const shopify = useAppBridge();

  const handleDownloadReport = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }
      
      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sustainability-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      shopify.toast.show("Sustainability report downloaded successfully!");
      
    } catch (err) {
      console.error('Error downloading report:', err);
      setError(err.message);
      shopify.toast.show("Failed to generate report", { isError: true });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card gap="400">
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd" color="red">
            📊 Sustainability Report
          </Text>
          <Text variant="bodyMd" as="p" color="subdued">
            Generate a comprehensive PDF report with your store's sustainability metrics, 
            trends, and actionable recommendations.
          </Text>
        </BlockStack>
        
        {error && (
          <Banner status="critical" title="Error generating report">
            <p>{error}</p>
          </Banner>
        )}
        
        <Box>
          <Button
            primary
            loading={isGenerating}
            disabled={isGenerating}
            onClick={handleDownloadReport}
          >
            {isGenerating ? 'Generating Report...' : 'Download Sustainability Report'}
          </Button>
        </Box>
        
        <Text variant="bodySm" as="p" color="subdued">
          Report includes: Sustainability score, material analysis, packaging efficiency, 
          delivery distance metrics, and personalized recommendations.
        </Text>
      </BlockStack>
    </Card>
  );
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Check if store exists in the database
  let store = await prisma.store.findUnique({
    where: { shopifyDomain: session.shop },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  // If no store exists, create one
  if (!store) {
    store = await prisma.store.create({
      data: {
        shopifyDomain: session.shop,
        name: session.shop.split(".")[0], // Basic name from domain
      },
    });
  }

  // Check if metafield definitions exist
  const metafieldDefinitionsQuery = `
    query {
      metafieldDefinitions(ownerType: PRODUCT, first: 10) {
        edges {
          node {
            id
            name
            key
            namespace
          }
        }
      }
    }
  `;

  const metafieldResponse = await admin.graphql(metafieldDefinitionsQuery);
  const metafieldData = await metafieldResponse.json();

  const existingDefinitions = metafieldData.data.metafieldDefinitions.edges.map(
    (edge) => ({
      key: edge.node.key,
      namespace: edge.node.namespace,
      name: edge.node.name,
      id: edge.node.id,
    }),
  );

  // Check if the specific metafield definitions exist
  const hasLocallyProduced = existingDefinitions.some(
    (def) => def.key === "locally_produced" && def.namespace === "custom",
  );

  const hasSustainableMaterials = existingDefinitions.some(
    (def) => def.key === "sustainable_materials" && def.namespace === "custom",
  );

  const hasPackagingWeight = existingDefinitions.some(
    (def) => def.key === "packaging_weight" && def.namespace === "custom",
  );

  const hasProductWeight = existingDefinitions.some(
    (def) => def.key === "product_weight" && def.namespace === "custom",
  );

  const allDefinitionsExist =
    hasLocallyProduced &&
    hasSustainableMaterials &&
    hasPackagingWeight &&
    hasProductWeight;

  // 🆕 ENHANCED: Check for missing products by comparing Shopify vs DB
  let syncStatus = "synced";
  let shopifyProductCount = 0;
  let missingProducts = [];

  try {
    // Get total product count from Shopify - using correct field name
    const shopifyCountQuery = `
      query {
        shop {
          products_count
        }
      }
    `;

    const countResponse = await admin.graphql(shopifyCountQuery);
    const countData = await countResponse.json();
    shopifyProductCount = countData.data?.shop?.products_count || 0;

    console.log(`📊 Shopify products: ${shopifyProductCount}, DB products: ${store._count?.products || 0}`);

    // If counts don't match, we need to check for missing products
    if (shopifyProductCount !== (store._count?.products || 0)) {
      console.log("🔍 Product counts don't match, checking for missing products...");
      
      // Get all Shopify product IDs
      const shopifyProductsQuery = `
        query GetAllProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            edges {
              node {
                id
                title
                createdAt
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      let hasNextPage = true;
      let endCursor = null;
      const allShopifyProducts = [];

      while (hasNextPage && allShopifyProducts.length < 1000) { // Limit to prevent timeouts
        const response = await admin.graphql(shopifyProductsQuery, {
          variables: { cursor: endCursor },
        });
        const data = await response.json();
        
        if (data.data?.products?.edges) {
          allShopifyProducts.push(...data.data.products.edges);
          hasNextPage = data.data.products.pageInfo.hasNextPage;
          endCursor = data.data.products.pageInfo.endCursor;
        } else {
          break;
        }
      }

      // Get all DB product IDs
      const dbProducts = await prisma.product.findMany({
        where: { storeId: store.id },
        select: { shopifyProductId: true, title: true }
      });

      const dbProductIds = new Set(dbProducts.map(p => p.shopifyProductId));

      // Find missing products
      missingProducts = allShopifyProducts
        .filter(edge => {
          const shopifyId = edge.node.id.replace("gid://shopify/Product/", "");
          return !dbProductIds.has(shopifyId);
        })
        .map(edge => ({
          id: edge.node.id.replace("gid://shopify/Product/", ""),
          title: edge.node.title,
          createdAt: edge.node.createdAt
        }));

      if (missingProducts.length > 0) {
        syncStatus = "needs_sync";
        console.log(`🔄 Found ${missingProducts.length} missing products in DB`);
      } else if (shopifyProductCount < (store._count?.products || 0)) {
        // More products in DB than Shopify (products were deleted)
        syncStatus = "needs_cleanup";
        console.log("🧹 Some products exist in DB but not in Shopify");
      } else {
        syncStatus = "synced";
        console.log("✅ Products are in sync");
      }
    }

  } catch (error) {
    console.error("❌ Error checking product sync:", error);
    syncStatus = "error";
  }
  
  // Update metrics if we have products
  if (store && store._count?.products > 0) {
    try {
      // Get all products from DB
      const products = await prisma.product.findMany({
        where: { storeId: store.id }
      });
      
      // Update Prometheus metrics for each product
      for (const product of products) {
        await updateProductMetrics(product);
      }
      
      // Update store-level metrics
      await updateStoreAggregatedMetrics(store.id);
      
    } catch (metricsError) {
      console.error("❌ Error updating metrics:", metricsError);
    }
  }

  return json({
    store: {
      id: store.id,
      name: store.name,
      domain: session.shop,
      productCount: store._count?.products || 0,
    },
    needsImport: store._count?.products === 0,
    needsMetafieldSetup: !allDefinitionsExist,
    // 🆕 NEW: Enhanced sync information
    syncStatus,
    shopifyProductCount,
    missingProductsCount: missingProducts.length,
    missingProducts: missingProducts.slice(0, 10), // Show first 10 for debugging
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "generate_product") {
    // Original product generation code
    const color = ["Red", "Orange", "Yellow", "Green"][
      Math.floor(Math.random() * 4)
    ];
    const response = await admin.graphql(
      `#graphql
        mutation populateProduct($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id
              title
              handle
              status
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    barcode
                    createdAt
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          product: {
            title: `${color} Snowboard`,
          },
        },
      },
    );
    const responseJson = await response.json();
    const product = responseJson.data.productCreate.product;
    const variantId = product.variants.edges[0].node.id;
    const variantResponse = await admin.graphql(
      `#graphql
      mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
            createdAt
          }
        }
      }`,
      {
        variables: {
          productId: product.id,
          variants: [{ id: variantId, price: "100.00" }],
        },
      },
    );
    const variantResponseJson = await variantResponse.json();

    return {
      action: "generate_product",
      product: responseJson.data.productCreate.product,
      variant:
        variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    };
  } else if (action === "create_metafield_definitions") {
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
  } else if (action === "import_products") {
    // Get store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
    });

    if (!store) {
      return json({
        action: "import_products",
        success: false,
        error: "Store not found",
      });
    }

    try {
      // Fetch products from Shopify with metafields
      let hasNextPage = true;
      let endCursor = null;
      let importCount = 0;
      let totalProducts = 0;

      while (hasNextPage) {
        const response = await admin.graphql(
          `#graphql
          query GetProductsWithMetafields($cursor: String) {
            products(first: 50, after: $cursor) {
              edges {
                node {
                  id
                  title
                  metafields(first: 10, namespace: "custom") {
                    edges {
                      node {
                        key
                        value
                        namespace
                      }
                    }
                  }
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

        totalProducts += products.length;

        // Import products
        for (const productEdge of products) {
          const shopifyProduct = productEdge.node;
          const shopifyProductId = shopifyProduct.id.replace(
            "gid://shopify/Product/",
            "",
          );

          // Process metafields
          const metafields = {};
          if (shopifyProduct.metafields && shopifyProduct.metafields.edges) {
            for (const metafieldEdge of shopifyProduct.metafields.edges) {
              const metafield = metafieldEdge.node;
              if (metafield.namespace === "custom") {
                switch (metafield.key) {
                  case "sustainable_materials":
                    metafields.sustainableMaterials = parseFloat(
                      metafield.value,
                    );
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

          // Check if product already exists
          const existingProduct = await prisma.product.findFirst({
            where: {
              shopifyProductId: shopifyProductId,
              storeId: store.id,
            },
          });

          if (existingProduct) {
            // Update existing product with any new metafields
            const updatedProduct = await prisma.product.update({
              where: {
                id: existingProduct.id,
              },
              data: {
                title: shopifyProduct.title,
                ...metafields,
                updatedAt: new Date(),
              },
            });

            // Update Prometheus metrics for existing product
            await updateProductMetrics(updatedProduct);
          } else {
            // Create new product
            const newProduct = await prisma.product.create({
              data: {
                shopifyProductId: shopifyProductId,
                title: shopifyProduct.title,
                storeId: store.id,
                ...metafields,
              },
            });

            // Update Prometheus metrics for new product
            await updateProductMetrics(newProduct);

            importCount++;
          }

          // Set default metafields for this product if they don't exist
          const metafieldsToSet = [];

          if (
            !shopifyProduct.metafields?.edges.some(
              (edge) => edge.node.key === "locally_produced",
            )
          ) {
            metafieldsToSet.push({
              key: "locally_produced",
              namespace: "custom",
              type: "boolean",
              value: "false",
            });
          }

          if (
            !shopifyProduct.metafields?.edges.some(
              (edge) => edge.node.key === "sustainable_materials",
            )
          ) {
            metafieldsToSet.push({
              key: "sustainable_materials",
              namespace: "custom",
              type: "number_decimal",
              value: "0.0",
            });
          }

          if (
            !shopifyProduct.metafields?.edges.some(
              (edge) => edge.node.key === "packaging_weight",
            )
          ) {
            metafieldsToSet.push({
              key: "packaging_weight",
              namespace: "custom",
              type: "number_decimal",
              value: "0.0",
            });
          }

          if (
            !shopifyProduct.metafields?.edges.some(
              (edge) => edge.node.key === "product_weight",
            )
          ) {
            metafieldsToSet.push({
              key: "product_weight",
              namespace: "custom",
              type: "number_decimal",
              value: "0.0",
            });
          }

          // If there are metafields to set for this product
          if (metafieldsToSet.length > 0) {
            try {
              const mutation = `
                mutation updateProductMetafields($input: ProductInput!) {
                  productUpdate(input: $input) {
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

              await admin.graphql(mutation, {
                variables: {
                  input: {
                    id: shopifyProduct.id,
                    metafields: metafieldsToSet,
                  },
                },
              });
            } catch (err) {
              console.error(
                `Error setting default metafields for product ${shopifyProduct.title}:`,
                err,
              );
            }
          }
        }

        // Prepare for next page if necessary
        hasNextPage = pageInfo.hasNextPage;
        endCursor = pageInfo.endCursor;
      }

      // Update store-level aggregated metrics after importing all products
      await updateStoreAggregatedMetrics(store.id);

      return json({
        action: "import_products",
        success: true,
        importCount,
        totalProducts,
        message: `Successfully imported ${importCount} products and initialized metrics`,
      });
    } catch (error) {
      console.error("Error importing products:", error);
      return json({
        action: "import_products",
        success: false,
        error: error.message,
      });
    }
  } else if (action === "sync_missing_products") {
    // 🆕 NEW: Sync missing products action
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
    });

    if (!store) {
      return json({
        action: "sync_missing_products",
        success: false,
        error: "Store not found",
      });
    }

    try {
      console.log("🔄 Starting sync of missing products...");

      // Get all DB product IDs for comparison
      const dbProducts = await prisma.product.findMany({
        where: { storeId: store.id },
        select: { shopifyProductId: true }
      });
      const dbProductIds = new Set(dbProducts.map(p => p.shopifyProductId));

      let hasNextPage = true;
      let endCursor = null;
      let syncCount = 0;
      let totalChecked = 0;

      while (hasNextPage && totalChecked < 1000) { // Prevent infinite loops
        const response = await admin.graphql(
          `#graphql
          query GetProductsWithMetafields($cursor: String) {
            products(first: 50, after: $cursor) {
              edges {
                node {
                  id
                  title
                  metafields(first: 10, namespace: "custom") {
                    edges {
                      node {
                        key
                        value
                        namespace
                      }
                    }
                  }
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

        totalChecked += products.length;

        // Process only missing products
        for (const productEdge of products) {
          const shopifyProduct = productEdge.node;
          const shopifyProductId = shopifyProduct.id.replace(
            "gid://shopify/Product/",
            "",
          );

          // Skip if product already exists in DB
          if (dbProductIds.has(shopifyProductId)) {
            continue;
          }

          console.log(`➕ Adding missing product: ${shopifyProduct.title}`);

          // Process metafields (same logic as import_products)
          const metafields = {};
          if (shopifyProduct.metafields && shopifyProduct.metafields.edges) {
            for (const metafieldEdge of shopifyProduct.metafields.edges) {
              const metafield = metafieldEdge.node;
              if (metafield.namespace === "custom") {
                switch (metafield.key) {
                  case "sustainable_materials":
                    metafields.sustainableMaterials = parseFloat(metafield.value);
                    break;
                  case "locally_produced":
                    metafields.isLocallyProduced = metafield.value.toLowerCase() === "true";
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

          // Calculate packaging ratio
          if (metafields.packagingWeight && metafields.productWeight && metafields.productWeight > 0) {
            metafields.packagingRatio = metafields.packagingWeight / metafields.productWeight;
          }

          // Create the missing product
          const newProduct = await prisma.product.create({
            data: {
              shopifyProductId: shopifyProductId,
              title: shopifyProduct.title,
              storeId: store.id,
              ...metafields,
            },
          });

          // Update Prometheus metrics
          await updateProductMetrics(newProduct);
          syncCount++;

          // Add the new product ID to our set to avoid duplicates
          dbProductIds.add(shopifyProductId);

          // Set default metafields if missing (same logic as import_products)
          const metafieldsToSet = [];

          if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "locally_produced")) {
            metafieldsToSet.push({
              key: "locally_produced",
              namespace: "custom",
              type: "boolean",
              value: "false",
            });
          }

          if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "sustainable_materials")) {
            metafieldsToSet.push({
              key: "sustainable_materials",
              namespace: "custom",
              type: "number_decimal",
              value: "0.0",
            });
          }

          if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "packaging_weight")) {
            metafieldsToSet.push({
              key: "packaging_weight",
              namespace: "custom",
              type: "number_decimal",
              value: "0.0",
            });
          }

          if (!shopifyProduct.metafields?.edges.some(edge => edge.node.key === "product_weight")) {
            metafieldsToSet.push({
              key: "product_weight",
              namespace: "custom",
              type: "number_decimal",
              value: "0.0",
            });
          }

          // Set default metafields
          if (metafieldsToSet.length > 0) {
            try {
              const mutation = `
                mutation updateProductMetafields($input: ProductInput!) {
                  productUpdate(input: $input) {
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

              await admin.graphql(mutation, {
                variables: {
                  input: {
                    id: shopifyProduct.id,
                    metafields: metafieldsToSet,
                  },
                },
              });
            } catch (err) {
              console.error(`Error setting metafields for ${shopifyProduct.title}:`, err);
            }
          }
        }

        hasNextPage = pageInfo.hasNextPage;
        endCursor = pageInfo.endCursor;
      }

      // Update store-level metrics after sync
      await updateStoreAggregatedMetrics(store.id);

      console.log(`✅ Sync complete: ${syncCount} products added`);

      return json({
        action: "sync_missing_products",
        success: true,
        syncCount,
        totalChecked,
        message: `Successfully synced ${syncCount} missing products`,
      });

    } catch (error) {
      console.error("❌ Error syncing missing products:", error);
      return json({
        action: "sync_missing_products",
        success: false,
        error: error.message,
      });
    }
  }

  return null;
};

export default function Index() {
  const { 
    store, 
    needsImport, 
    needsMetafieldSetup,
    // 🆕 NEW: Enhanced sync data
    syncStatus,
    shopifyProductCount,
    missingProductsCount,
    missingProducts
  } = useLoaderData();
  
  const fetcher = useFetcher();
  const importFetcher = useFetcher();
  const metafieldFetcher = useFetcher();
  const syncFetcher = useFetcher(); // 🆕 NEW: Sync fetcher
  const shopify = useAppBridge();

  const isImporting =
    ["loading", "submitting"].includes(importFetcher.state) &&
    importFetcher.formMethod === "POST";

  const isCreatingMetafields =
    ["loading", "submitting"].includes(metafieldFetcher.state) &&
    metafieldFetcher.formMethod === "POST";

  const isSyncing = // 🆕 NEW
    ["loading", "submitting"].includes(syncFetcher.state) &&
    syncFetcher.formMethod === "POST";

  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  // Create metafield definitions if needed
  useEffect(() => {
    if (
      needsMetafieldSetup &&
      !isCreatingMetafields &&
      !metafieldFetcher.data
    ) {
      metafieldFetcher.submit(
        { action: "create_metafield_definitions" },
        { method: "POST" },
      );
    }
  }, [needsMetafieldSetup, isCreatingMetafields, metafieldFetcher]);

  // Trigger product import automatically if needed (after metafields are set up)
  useEffect(() => {
    // Only import if metafields are set up (or don't need setup) and import is needed
    const metafieldsReady =
      !needsMetafieldSetup ||
      (metafieldFetcher.data && metafieldFetcher.data.success);

    if (needsImport && metafieldsReady && !isImporting && !importFetcher.data) {
      importFetcher.submit({ action: "import_products" }, { method: "POST" });
    }
  }, [
    needsImport,
    needsMetafieldSetup,
    isImporting,
    importFetcher,
    metafieldFetcher.data,
  ]);

  // 🆕 NEW: Auto-sync missing products if detected
  useEffect(() => {
    const metafieldsReady = !needsMetafieldSetup || (metafieldFetcher.data && metafieldFetcher.data.success);
    const shouldAutoSync = syncStatus === "needs_sync" && missingProductsCount > 0 && missingProductsCount < 50; // Only auto-sync if < 50 missing

    if (shouldAutoSync && metafieldsReady && !isSyncing && !syncFetcher.data && !needsImport) {
      console.log(`🔄 Auto-syncing ${missingProductsCount} missing products...`);
      syncFetcher.submit({ action: "sync_missing_products" }, { method: "POST" });
    }
  }, [syncStatus, missingProductsCount, needsMetafieldSetup, isSyncing, syncFetcher, metafieldFetcher.data, needsImport]);

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }

    if (importFetcher.data?.success) {
      shopify.toast.show(
        `${importFetcher.data.importCount} products imported and metrics initialized`,
      );
    }

    if (metafieldFetcher.data?.success) {
      shopify.toast.show("Sustainability metrics initialized");
    }

    // 🆕 NEW: Sync success toast
    if (syncFetcher.data?.success) {
      shopify.toast.show(`${syncFetcher.data.syncCount} missing products synced`);
    }
  }, [productId, importFetcher.data, metafieldFetcher.data, syncFetcher.data, shopify]);

  // Manual import trigger if needed
  const triggerImport = () => {
    importFetcher.submit({ action: "import_products" }, { method: "POST" });
  };

  // 🆕 NEW: Manual sync trigger
  const triggerSync = () => {
    syncFetcher.submit({ action: "sync_missing_products" }, { method: "POST" });
  };

  // Check if store has products and setup is complete
  const canGenerateReport = store.productCount > 0 && !needsMetafieldSetup && !needsImport;

  return (
    <Page>
      <TitleBar title="Green Metrics App">
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Welcome to the Green Metrics app by Federico Pedro Barbieri
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Track sustainability metrics for your products and improve
                    your store's environmental impact.
                  </Text>
                </BlockStack>

                {/* 🆕 NEW: Product Sync Status */}
                {syncStatus === "needs_sync" && !isSyncing && (
                  <Banner title={`${missingProductsCount} Products Need Syncing`} tone="warning">
                    <p>
                      Your store has {shopifyProductCount} products, but only {store.productCount} are in our database. 
                      {missingProductsCount < 50 ? " We'll sync them automatically." : " Click below to sync manually."}
                    </p>
                    {missingProductsCount >= 50 && (
                      <Button onClick={triggerSync} disabled={isSyncing}>
                        Sync Missing Products
                      </Button>
                    )}
                  </Banner>
                )}

                {syncStatus === "needs_cleanup" && (
                  <Banner title="Database Cleanup Needed" tone="info">
                    <p>
                      Some products in our database may have been deleted from your Shopify store. 
                      Database: {store.productCount}, Shopify: {shopifyProductCount}
                    </p>
                  </Banner>
                )}

                {syncStatus === "synced" && store.productCount > 0 && (
                  <Banner title="Products In Sync" tone="success">
                    <p>All {store.productCount} products are synchronized and ready for sustainability tracking.</p>
                  </Banner>
                )}

                {syncStatus === "error" && (
                  <Banner title="Sync Check Failed" tone="critical">
                    <p>Unable to check product sync status. Check logs for details.</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                  </Banner>
                )}

                {isSyncing && (
                  <Banner title="Syncing Missing Products" tone="info">
                    <p>We're adding missing products to the database and setting up their sustainability metrics...</p>
                  </Banner>
                )}

                {syncFetcher.data?.success && (
                  <Banner title="Sync Complete" tone="success">
                    <p>{syncFetcher.data.message}</p>
                  </Banner>
                )}

                {syncFetcher.data?.success === false && (
                  <Banner title="Sync Failed" tone="critical">
                    <p>Failed to sync products: {syncFetcher.data.error}</p>
                    <Button onClick={triggerSync}>Try Again</Button>
                  </Banner>
                )}

                {/* Metafield Setup Status */}
                {isCreatingMetafields && (
                  <Banner title="Setting Up Sustainability Metrics" tone="info">
                    <p>
                      We're setting up the necessary fields to track
                      sustainability metrics for your products...
                    </p>
                  </Banner>
                )}

                {metafieldFetcher.data?.success && (
                  <Banner title="Metrics Setup Complete" tone="success">
                    <p>
                      Successfully set up sustainability metrics tracking for
                      your store.
                    </p>
                  </Banner>
                )}

                {metafieldFetcher.data?.success === false && (
                  <Banner title="Setup Failed" tone="critical">
                    <p>
                      Failed to set up sustainability metrics:{" "}
                      {metafieldFetcher.data.error}
                    </p>
                    <Button
                      onClick={() =>
                        metafieldFetcher.submit(
                          { action: "create_metafield_definitions" },
                          { method: "POST" },
                        )
                      }
                    >
                      Try Again
                    </Button>
                  </Banner>
                )}

                {/* Product Import Status */}
                {isImporting && (
                  <Banner title="Importing Products" tone="info">
                    <p>
                      We're importing your products from Shopify and
                      initializing metrics. This may take a moment...
                    </p>
                  </Banner>
                )}

                {importFetcher.data?.success && (
                  <Banner title="Products Imported Successfully" tone="success">
                    <p>{importFetcher.data.message}</p>
                  </Banner>
                )}

                {importFetcher.data?.success === false && (
                  <Banner title="Import Failed" tone="critical">
                    <p>Failed to import products: {importFetcher.data.error}</p>
                    <Button onClick={triggerImport}>Try Again</Button>
                  </Banner>
                )}

                {!isImporting &&
                  !importFetcher.data &&
                  store.productCount > 0 && (
                    <Banner title="Products Ready" tone="success" gap="200">
                      <p>
                        You have {store.productCount} products ready for
                        sustainability tracking.
                      </p>
                    </Banner>
                  )}

                {/* 🆕 NEW: Debug info for missing products (only show in development) */}
                {missingProducts && missingProducts.length > 0 && process.env.NODE_ENV === 'development' && (
                  <Banner title="Debug: Missing Products" tone="info">
                    <p>Sample missing products:</p>
                    <List>
                      {missingProducts.slice(0, 3).map(product => (
                        <List.Item key={product.id}>{product.title}</List.Item>
                      ))}
                    </List>
                  </Banner>
                )}

                {fetcher.data?.product && (
                  <>
                    <Text as="h3" variant="headingMd">
                      {" "}
                      productCreate mutation
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.product, null, 2)}
                        </code>
                      </pre>
                    </Box>
                    <Text as="h3" variant="headingMd">
                      {" "}
                      productVariantsBulkUpdate mutation
                    </Text>
                    <Box
                      padding="400"
                      background="bg-surface-active"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      overflowX="scroll"
                    >
                      <pre style={{ margin: 0 }}>
                        <code>
                          {JSON.stringify(fetcher.data.variant, null, 2)}
                        </code>
                      </pre>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* NEW: Sustainability Report Download Card */}
            {canGenerateReport && <SustainabilityReportDownload />}
            
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Sustainability Metrics
                  </Text>
                  <List>
                    <List.Item>Track product origins</List.Item>
                    <List.Item>Monitor shipping distances</List.Item>
                    <List.Item>Manage packaging efficiency</List.Item>
                    <List.Item>Display sustainability badges</List.Item>
                  </List>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Developed by Mercive - The Shopify Agency -
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Mercive is a Shopify agency focused on building sustainable
                    and high-performance e-commerce solutions. We help brands
                    optimize their stores for speed, sustainability, and growth.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}