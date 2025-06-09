// app/routes/webhooks.products.delete.jsx 
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  
  
  
  // Log raw body before authentication
  try {
    const bodyText = await request.text();
    
    // Create new request with same body for authentication
    const newRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyText
    });
    
    try {
      const { shop, payload } = await authenticate.webhook(newRequest);
      
      
      // Find store
      const store = await prisma.store.findUnique({
        where: { shopifyDomain: shop },
      });
      
      if (!store) {
        console.error(`❌ [${requestId}] Store not found: ${shop}`);
        const allStores = await prisma.store.findMany({
          select: { shopifyDomain: true, id: true, name: true }
        });
        
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
      
      
      // Extract product data
      const productId = payload.id?.toString();
      
      
      // Find product in database
      const product = await prisma.product.findFirst({
        where: {
          shopifyProductId: productId,
          storeId: store.id,
        },
      });
      
      if (!product) {
      
        
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
      
      
      const deletedProduct = await prisma.product.delete({
        where: { id: product.id },
      });
      
      
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
      console.error(` [${requestId}] AUTHENTICATION FAILED:`, authError.message);
      console.error(` [${requestId}] Auth stack trace:`, authError.stack);
      
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
    console.error(` [${requestId}] BODY PARSING FAILED:`, bodyError.message);
    console.error(` [${requestId}] Body parsing stack trace:`, bodyError.stack);
    
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