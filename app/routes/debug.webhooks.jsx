// Create this file: app/routes/debug.webhooks.jsx
// Access it at: https://sustainablefashionmetrics.net/debug/webhooks

import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function loader({ request }) {
  try {
    // Check if user is authenticated
    const { admin, session } = await authenticate.admin(request);
    
    console.log("🔍 Debug: Checking webhook registration...");
    
    // Check registered webhooks
    const webhooksQuery = `
      query {
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
              createdAt
              updatedAt
            }
          }
        }
      }
    `;
    
    const webhooksResponse = await admin.graphql(webhooksQuery);
    const webhooksData = await webhooksResponse.json();
    
    // Check store in database
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
      include: {
        products: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    // Check recent products from Shopify
    const productsQuery = `
      query {
        products(first: 5, reverse: true) {
          edges {
            node {
              id
              title
              createdAt
              metafields(namespace: "custom", first: 10) {
                edges {
                  node {
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const productsResponse = await admin.graphql(productsQuery);
    const productsData = await productsResponse.json();
    
    return json({
      success: true,
      debug: {
        shop: session.shop,
        webhooks: webhooksData.data?.webhookSubscriptions?.edges || [],
        store: store ? {
          id: store.id,
          domain: store.shopifyDomain,
          productCount: store.products.length,
          recentProducts: store.products
        } : null,
        shopifyProducts: productsData.data?.products?.edges || [],
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error("❌ Debug webhook error:", error);
    return json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

// Simple debug page
export default function WebhookDebug() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Webhook Debug Information</h1>
      <p>Check the browser console or network tab for debug data.</p>
      <script dangerouslySetInnerHTML={{
        __html: `
          fetch('/debug/webhooks')
            .then(r => r.json())
            .then(data => {
              console.log('🔍 Webhook Debug Data:', data);
              document.body.innerHTML += '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            })
            .catch(e => console.error('Debug fetch error:', e));
        `
      }} />
    </div>
  );
}