// app/routes/webhooks.products.delete.jsx - DIAGNOSTIC VERSION
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // 🚨 FIRST - Log that the endpoint was hit
  console.log(`🔴 DELETE WEBHOOK ENDPOINT HIT! [${requestId}] at ${new Date().toISOString()}`);
  console.log(`📋 [${requestId}] Request URL: ${request.url}`);
  console.log(`📋 [${requestId}] Request method: ${request.method}`);
  
  // Log ALL headers
  const headers = Object.fromEntries(request.headers.entries());
  console.log(`📋 [${requestId}] ALL Headers:`, JSON.stringify(headers, null, 2));
  
  // Log raw body before authentication
  try {
    const bodyText = await request.text();
    console.log(`📦 [${requestId}] Raw body length: ${bodyText.length}`);
    console.log(`📦 [${requestId}] Raw body (first 500 chars): ${bodyText.substring(0, 500)}`);
    
    // Create new request with same body for authentication
    const newRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyText
    });
    
    try {
      console.log(`🔐 [${requestId}] Attempting webhook authentication...`);
      const { shop, payload } = await authenticate.webhook(newRequest);
      
      console.log(`✅ [${requestId}] Authentication SUCCESS for shop: ${shop}`);
      console.log(`📦 [${requestId}] Payload:`, JSON.stringify(payload, null, 2));
      
      // Find store
      console.log(`🔍 [${requestId}] Looking for store: ${shop}`);
      const store = await prisma.store.findUnique({
        where: { shopifyDomain: shop },
      });
      
      if (!store) {
        console.error(`❌ [${requestId}] Store not found: ${shop}`);
        const allStores = await prisma.store.findMany({
          select: { shopifyDomain: true, id: true, name: true }
        });
        console.log(`📋 [${requestId}] Available stores:`, allStores);
        
        return new Response(JSON.stringify({ 
          error: "Store not found",
          requestId,
          shop: shop,
          available_stores: allStores.map(s => s.shopifyDomain)
        }), { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`✅ [${requestId}] Store found: ${store.shopifyDomain} (ID: ${store.id})`);
      
      // Extract product data
      const productId = payload.id?.toString();
      const productTitle = payload.title || `Product ${productId}`;
      
      console.log(`🔍 [${requestId}] Processing DELETE for product: ${productId} - "${productTitle}"`);
      
      // Find product in database
      const product = await prisma.product.findFirst({
        where: {
          shopifyProductId: productId,
          storeId: store.id,
        },
      });
      
      if (!product) {
        console.log(`⚠️ [${requestId}] Product NOT FOUND in database - this might be normal`);
        console.log(`📊 [${requestId}] Reasons this could be normal:`);
        console.log(`   - Product was deleted before webhook setup`);
        console.log(`   - Product was never synced to our database`);
        console.log(`   - Previous delete webhook already processed this`);
        
        return new Response(JSON.stringify({ 
          success: true,
          message: "Product not found in database (normal if never synced or already deleted)",
          productId: productId,
          requestId,
          action: "no_action_needed"
        }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`✅ [${requestId}] Found product in database:`, {
        databaseId: product.id,
        title: product.title,
        shopifyProductId: product.shopifyProductId,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      });
      
      // DELETE the product
      console.log(`🗑️ [${requestId}] DELETING product from database...`);
      
      const deletedProduct = await prisma.product.delete({
        where: { id: product.id },
      });
      
      console.log(`✅ [${requestId}] Product SUCCESSFULLY DELETED from database!`);
      console.log(`🎉 [${requestId}] DELETE WEBHOOK COMPLETED SUCCESSFULLY in ${Date.now() - startTime}ms`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        productId: deletedProduct.id,
        shopifyProductId: productId,
        action: "successfully_deleted",
        processingTime: Date.now() - startTime,
        requestId: requestId,
        message: "Product deleted successfully"
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (authError) {
      console.error(`❌ [${requestId}] AUTHENTICATION FAILED:`, authError.message);
      console.error(`📍 [${requestId}] Auth stack trace:`, authError.stack);
      
      return new Response(JSON.stringify({ 
        error: "Authentication failed",
        message: authError.message,
        requestId: requestId,
        hint: "Check if this request is coming from Shopify with proper headers"
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
  } catch (bodyError) {
    console.error(`❌ [${requestId}] BODY PARSING FAILED:`, bodyError.message);
    console.error(`📍 [${requestId}] Body parsing stack trace:`, bodyError.stack);
    
    return new Response(JSON.stringify({ 
      error: "Body parsing failed",
      message: bodyError.message,
      requestId: requestId
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};