// app/routes/api.import-metafields.jsx 
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import { updateProductMetrics } from "../utils/metrics";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  

  try {
    const { admin, session } = await authenticate.admin(request);
    const rowData = await request.json();

   

    const validateAndClamp = (value, fieldName, min = 0.01, max = 1.00) => {
      if (value === undefined || value === null || value === '') return null;
      
      let num = parseFloat(value);
      if (isNaN(num)) return null;
      
      // Convert percentage to decimal if needed (90 → 0.90)
      if (num > 1 && num <= 100 && fieldName === 'sustainable_materials') {
        num = num / 100;
      }
      
      // Clamp to valid range
      num = Math.max(min, Math.min(max, num));
      return Math.round(num * 100) / 100;
    };

    // Extract and validate product ID
    const productId = rowData.product_id?.toString();
    if (!productId) {
      return json({
        success: false,
        error: "Missing product_id",
        rowNumber: rowData._rowNumber
      }, { status: 400 });
    }

    // GET STORE
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
    });

    if (!store) {
      return json({
        success: false,
        error: "Store not found",
        rowNumber: rowData._rowNumber
      }, { status: 404 });
    }

    // VALIDATE PRODUCT EXISTS IN SHOPIFY
    
    const productQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
        }
      }
    `;

    const productResponse = await admin.graphql(productQuery, {
      variables: { id: `gid://shopify/Product/${productId}` }
    });

    const productData = await productResponse.json();
    
    if (!productData.data?.product) {
      return json({
        success: false,
        error: `Product ${productId} not found in Shopify`,
        rowNumber: rowData._rowNumber
      }, { status: 404 });
    }

    const productTitle = productData.data.product.title;

    // PROCESS METAFIELDS
    const metafieldsToUpdate = [];
    const processedMetafields = {};

    // Process sustainable_materials
    if (rowData.sustainable_materials !== undefined && rowData.sustainable_materials !== null && rowData.sustainable_materials !== '') {
      const sustainableValue = validateAndClamp(rowData.sustainable_materials, 'sustainable_materials', 0.01, 1.00);
      if (sustainableValue !== null) {
        metafieldsToUpdate.push({
          key: "sustainable_materials",
          namespace: "custom",
          type: "number_decimal",
          value: sustainableValue.toString()
        });
        processedMetafields.sustainableMaterials = sustainableValue;
      }
    }

    // Process locally_produced
    if (rowData.locally_produced !== undefined && rowData.locally_produced !== null && rowData.locally_produced !== '') {
      const localValue = rowData.locally_produced.toString().toLowerCase();
      const isLocal = ['true', '1', 'yes'].includes(localValue);
      metafieldsToUpdate.push({
        key: "locally_produced",
        namespace: "custom",
        type: "boolean",
        value: isLocal.toString()
      });
      processedMetafields.isLocallyProduced = isLocal;
    }

    // Process packaging_weight
    if (rowData.packaging_weight !== undefined && rowData.packaging_weight !== null && rowData.packaging_weight !== '') {
      const packagingWeight = validateAndClamp(rowData.packaging_weight, 'packaging_weight', 0.01, 1000);
      if (packagingWeight !== null) {
        metafieldsToUpdate.push({
          key: "packaging_weight",
          namespace: "custom",
          type: "number_decimal",
          value: packagingWeight.toString()
        });
        processedMetafields.packagingWeight = packagingWeight;
      }
    }

    // Process product_weight
    if (rowData.product_weight !== undefined && rowData.product_weight !== null && rowData.product_weight !== '') {
      const productWeight = validateAndClamp(rowData.product_weight, 'product_weight', 0.01, 1000);
      if (productWeight !== null) {
        metafieldsToUpdate.push({
          key: "product_weight",
          namespace: "custom",
          type: "number_decimal",
          value: productWeight.toString()
        });
        processedMetafields.productWeight = productWeight;
      }
    }

    // Calculate packaging ratio if both weights are available
    if (processedMetafields.packagingWeight && processedMetafields.productWeight && processedMetafields.productWeight > 0) {
      processedMetafields.packagingRatio = processedMetafields.packagingWeight / processedMetafields.productWeight;
    }

    if (metafieldsToUpdate.length === 0) {
      return json({
        success: false,
        error: "No valid metafields to update",
        rowNumber: rowData._rowNumber
      }, { status: 400 });
    }

    // UPDATE METAFIELDS IN SHOPIFY

    const updateMutation = `
      mutation updateProductMetafields($input: ProductInput!) {
        productUpdate(input: $input) {
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

    const updateResponse = await admin.graphql(updateMutation, {
      variables: {
        input: {
          id: `gid://shopify/Product/${productId}`,
          metafields: metafieldsToUpdate
        }
      }
    });

    const updateResult = await updateResponse.json();

    if (updateResult.data?.productUpdate?.userErrors?.length > 0) {
      const errors = updateResult.data.productUpdate.userErrors;
      console.error(`[${requestId}] Shopify update errors:`, errors);
      return json({
        success: false,
        error: errors.map(e => e.message).join(", "),
        rowNumber: rowData._rowNumber
      }, { status: 400 });
    }


    // UPDATE LOCAL DATABASE

    const existingProduct = await prisma.product.findFirst({
      where: {
        shopifyProductId: productId,
        storeId: store.id,
      },
    });

    let updatedProduct;

    if (existingProduct) {
      // Update existing product
      updatedProduct = await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          title: productTitle,
          ...processedMetafields,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new product record
      updatedProduct = await prisma.product.create({
        data: {
          shopifyProductId: productId,
          title: productTitle,
          storeId: store.id,
          sustainableMaterials: processedMetafields.sustainableMaterials || 0,
          isLocallyProduced: processedMetafields.isLocallyProduced || false,
          packagingWeight: processedMetafields.packagingWeight || 0,
          productWeight: processedMetafields.productWeight || 0,
          packagingRatio: processedMetafields.packagingRatio || 0,
        },
      });
    }

    // UPDATE PROMETHEUS METRICS
    try {
      await updateProductMetrics(updatedProduct);
    } catch (metricsError) {
      console.error(`[${requestId}] Metrics update failed:`, metricsError);
      // Don't fail the whole request for metrics errors
    }

    const processingTime = Date.now() - startTime;

    return json({
      success: true,
      productId: updatedProduct.id,
      shopifyProductId: productId,
      productTitle: productTitle,
      updatedFields: Object.keys(processedMetafields),
      processingTime: processingTime,
      rowNumber: rowData._rowNumber
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[${requestId}] CSV import failed after ${processingTime}ms:`, error.message);
    console.error(`[${requestId}] Stack trace:`, error.stack);

    return json({
      success: false,
      error: error.message,
      processingTime: processingTime,
      rowNumber: request.body?._rowNumber
    }, { status: 500 });
  }
};