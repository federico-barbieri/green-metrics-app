// app/utils/indexLoader.js
import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../metrics";
import { updateStoreAggregatedMetrics } from "../storeMetrics";

const prisma = new PrismaClient();

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

  // Enhanced: Check for missing products by comparing Shopify vs DB
  let syncStatus = "synced";
  let shopifyProductCount = 0;
  let missingProducts = [];

  try {
    
    let hasNextPage = true;
    let endCursor = null;
    let allShopifyProducts = [];
    const maxProductsToFetch = 1000; 

    const shopifyProductsQuery = `
      query GetAllProducts($cursor: String) {
        products(first: 50, after: $cursor) {
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

    // Fetch all products (up to limit)
    while (hasNextPage && allShopifyProducts.length < maxProductsToFetch) {
      const response = await admin.graphql(shopifyProductsQuery, {
        variables: { cursor: endCursor },
      });
      const data = await response.json();
      
      if (data.data?.products?.edges) {
        allShopifyProducts.push(...data.data.products.edges);
        hasNextPage = data.data.products.pageInfo.hasNextPage;
        endCursor = data.data.products.pageInfo.endCursor;
      } else {
        console.error("Error fetching products:", data.errors);
        break;
      }
    }

    shopifyProductCount = allShopifyProducts.length;
    const hasMoreProducts = hasNextPage; // True if there are more products beyond our limit


    // Get all DB product IDs for comparison
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

    // Determine sync status
    if (missingProducts.length > 0) {
      syncStatus = "needs_sync";
    } else if (shopifyProductCount < (store._count?.products || 0)) {
      // More products in DB than Shopify (products were deleted)
      syncStatus = "needs_cleanup";
    } else if (hasMoreProducts && shopifyProductCount >= (store._count?.products || 0)) {
      // There might be more products in Shopify that we haven't fetched
      syncStatus = "might_need_sync";
    } else {
      syncStatus = "synced";
    }

  } catch (error) {
    console.error("Error checking product sync:", error);
    syncStatus = "error";
    shopifyProductCount = 0;
    missingProducts = [];
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
      console.error("Error updating metrics:", metricsError);
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
    // Enhanced sync information
    syncStatus,
    shopifyProductCount,
    missingProductsCount: missingProducts.length,
    missingProducts: missingProducts.slice(0, 10), // Show first 10 for debugging
  });
};