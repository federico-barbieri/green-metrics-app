// app/routes/app.debug.delete-webhook.jsx - Delete Webhook Specific Debugging

import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Banner, Button, List } from "@shopify/polaris";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // 1. Check webhook registration specifically for DELETE
    const webhookResponse = await admin.graphql(`
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
    `);
    
    const webhookData = await webhookResponse.json();
    const webhooks = webhookData.data?.webhookSubscriptions?.edges || [];
    
    // 2. Get recent products from Shopify
    const productsResponse = await admin.graphql(`
      query {
        products(first: 10, reverse: true) {
          edges {
            node {
              id
              title
              status
              createdAt
              updatedAt
            }
          }
        }
      }
    `);
    
    const productsData = await productsResponse.json();
    const shopifyProducts = productsData.data?.products?.edges || [];
    
    // 3. Get products from our database
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
    });
    
    let dbProducts = [];
    if (store) {
      dbProducts = await prisma.product.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
    }
    
    // 4. Compare Shopify vs DB products
    const shopifyProductIds = shopifyProducts.map(p => p.node.id.split('/').pop());
    
    // Find products in DB but not in Shopify (should be deleted)
    const orphanedProducts = dbProducts.filter(
      dbProduct => !shopifyProductIds.includes(dbProduct.shopifyProductId)
    );
    
    const currentUrl = new URL(request.url).origin;
    
    return json({
      webhooks,
      shopifyProducts: shopifyProducts.map(p => ({
        id: p.node.id.split('/').pop(),
        title: p.node.title,
        status: p.node.status,
        createdAt: p.node.createdAt,
        updatedAt: p.node.updatedAt
      })),
      dbProducts,
      orphanedProducts,
      shop: session.shop,
      currentUrl,
      store
    });
  } catch (error) {
    console.error("Error in loader:", error);
    return json({
      error: error.message,
      webhooks: [],
      shopifyProducts: [],
      dbProducts: [],
      orphanedProducts: [],
      shop: session.shop,
      currentUrl: new URL(request.url).origin,
      store: null
    });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  if (actionType === "test_delete_webhook") {
    
    try {
      // Create a test product that we can immediately delete
      const createResponse = await admin.graphql(`
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
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
      `, {
        variables: {
          input: {
            title: `Test Delete Product ${Date.now()}`,
            status: 'DRAFT'
          }
        }
      });
      
      const createData = await createResponse.json();
      
      if (createData.data?.productCreate?.userErrors?.length > 0) {
        return json({
          action: "test_delete_webhook",
          success: false,
          error: createData.data.productCreate.userErrors[0].message
        });
      }
      
      const newProductId = createData.data.productCreate.product.id;
      const numericId = newProductId.split('/').pop();
      
      // Wait a moment for webhook to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Now delete the product
      const deleteResponse = await admin.graphql(`
        mutation productDelete($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: newProductId
          }
        }
      });
      
      const deleteData = await deleteResponse.json();
      
      return json({
        action: "test_delete_webhook",
        success: true,
        createdProductId: numericId,
        deletedProductId: deleteData.data?.productDelete?.deletedProductId,
        message: "Test product created and deleted. Check logs for webhook processing."
      });
      
    } catch (error) {
      return json({
        action: "test_delete_webhook",
        success: false,
        error: error.message
      });
    }
  }
  
  if (actionType === "cleanup_orphaned") {
    try {
      const store = await prisma.store.findUnique({
        where: { shopifyDomain: session.shop },
      });
      
      if (!store) {
        return json({
          action: "cleanup_orphaned",
          success: false,
          error: "Store not found"
        });
      }
      
      // Get all products from Shopify
      const productsResponse = await admin.graphql(`
        query {
          products(first: 250) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      
      const productsData = await productsResponse.json();
      const shopifyProductIds = productsData.data?.products?.edges?.map(
        p => p.node.id.split('/').pop()
      ) || [];
      
      // Find orphaned products in DB
      const orphanedProducts = await prisma.product.findMany({
        where: {
          storeId: store.id,
          shopifyProductId: {
            notIn: shopifyProductIds
          }
        }
      });
      
      // Delete orphaned products
      const deleteResult = await prisma.product.deleteMany({
        where: {
          storeId: store.id,
          shopifyProductId: {
            notIn: shopifyProductIds
          }
        }
      });
      
      return json({
        action: "cleanup_orphaned",
        success: true,
        deletedCount: deleteResult.count,
        orphanedProducts: orphanedProducts.map(p => ({ 
          id: p.id, 
          shopifyProductId: p.shopifyProductId, 
          title: p.title 
        }))
      });
      
    } catch (error) {
      return json({
        action: "cleanup_orphaned",
        success: false,
        error: error.message
      });
    }
  }
  
  if (actionType === "re_register_delete_webhook") {
    try {
      const currentUrl = new URL(request.url).origin;
      
      // First, try to delete existing PRODUCTS_DELETE webhook
      const webhooksResponse = await admin.graphql(`
        query {
          webhookSubscriptions(first: 50) {
            edges {
              node {
                id
                topic
              }
            }
          }
        }
      `);
      
      const webhooksData = await webhooksResponse.json();
      const deleteWebhook = webhooksData.data?.webhookSubscriptions?.edges?.find(
        w => w.node.topic === 'PRODUCTS_DELETE'
      );
      
      if (deleteWebhook) {
        await admin.graphql(`
          mutation webhookSubscriptionDelete($id: ID!) {
            webhookSubscriptionDelete(id: $id) {
              deletedWebhookSubscriptionId
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: { id: deleteWebhook.node.id }
        });
      }
      
      // Now register new webhook
      const response = await admin.graphql(`
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          topic: 'PRODUCTS_DELETE',
          webhookSubscription: {
            callbackUrl: `${currentUrl}/webhooks/products/delete`,
            format: 'JSON'
          }
        }
      });
      
      const responseJson = await response.json();
      
      return json({
        action: "re_register_delete_webhook",
        success: !responseJson.data?.webhookSubscriptionCreate?.userErrors?.length,
        errors: responseJson.data?.webhookSubscriptionCreate?.userErrors || [],
        webhookId: responseJson.data?.webhookSubscriptionCreate?.webhookSubscription?.id
      });
      
    } catch (error) {
      return json({
        action: "re_register_delete_webhook",
        success: false,
        error: error.message
      });
    }
  }
  
  return json({ error: "Unknown action" }, { status: 400 });
};

export default function DeleteWebhookDebug() {
  const { 
    webhooks, 
    shopifyProducts, 
    dbProducts, 
    orphanedProducts, 
    shop, 
    currentUrl, 
    store,
    error 
  } = useLoaderData();
  
  const fetcher = useFetcher();
  
  if (error) {
    return (
      <Page title="Delete Webhook Debug - Error">
        <Banner status="critical" title="Error loading data">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }
  
  const deleteWebhook = webhooks.find(w => w.node.topic === 'PRODUCTS_DELETE');
  const hasDeleteWebhook = !!deleteWebhook;
  
  const isDeleteWebhookCorrect = deleteWebhook?.node.endpoint?.callbackUrl === 
    `${currentUrl}/webhooks/products/delete`;
  
  return (
    <Page 
      title="🗑️ Delete Webhook Debug" 
      subtitle={`Shop: ${shop}`}
      backAction={{ content: "Back to Webhook Debug", url: "/app/debug/webhooks" }}
    >
      <BlockStack gap="500">
        
        {/* Delete Webhook Status */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">🎯 Delete Webhook Status</Text>
            
            {!hasDeleteWebhook ? (
              <Banner status="critical" title="❌ PRODUCTS_DELETE webhook not registered">
                <p>This is likely why your delete webhook isn't working!</p>
                <fetcher.Form method="post" style={{ marginTop: '1rem' }}>
                  <input type="hidden" name="action" value="re_register_delete_webhook" />
                  <Button submit primary loading={fetcher.state === "submitting"}>
                    🔧 Register Delete Webhook
                  </Button>
                </fetcher.Form>
              </Banner>
            ) : !isDeleteWebhookCorrect ? (
              <Banner status="warning" title="⚠️ Delete webhook URL incorrect">
                <BlockStack gap="200">
                  <Text variant="bodySm">Expected: <code>{currentUrl}/webhooks/products/delete</code></Text>
                  <Text variant="bodySm">Actual: <code>{deleteWebhook.node.endpoint.callbackUrl}</code></Text>
                  <fetcher.Form method="post">
                    <input type="hidden" name="action" value="re_register_delete_webhook" />
                    <Button submit primary loading={fetcher.state === "submitting"}>
                      🔧 Fix Delete Webhook URL
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              </Banner>
            ) : (
              <Banner status="success" title="✅ Delete webhook properly registered">
                <BlockStack gap="200">
                  <Text variant="bodySm">URL: <code>{deleteWebhook.node.endpoint.callbackUrl}</code></Text>
                  <Text variant="bodySm">Created: {new Date(deleteWebhook.node.createdAt).toLocaleString()}</Text>
                </BlockStack>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Sync Status */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">📊 Database Sync Status</Text>
            
            <BlockStack gap="200">
              <Text variant="bodyMd">📦 Products in Shopify: <strong>{shopifyProducts.length}</strong></Text>
              <Text variant="bodyMd">💾 Products in Database: <strong>{dbProducts.length}</strong></Text>
              <Text variant="bodyMd">👻 Orphaned Products: <strong>{orphanedProducts.length}</strong></Text>
            </BlockStack>
            
            {orphanedProducts.length > 0 && (
              <Banner status="warning" title="⚠️ Found orphaned products in database">
                <BlockStack gap="200">
                  <Text variant="bodySm">
                    These products exist in your database but not in Shopify (likely deleted without webhook processing):
                  </Text>
                  <List>
                    {orphanedProducts.slice(0, 5).map(product => (
                      <List.Item key={product.id}>
                        {product.title} (ID: {product.shopifyProductId})
                      </List.Item>
                    ))}
                    {orphanedProducts.length > 5 && (
                      <List.Item>...and {orphanedProducts.length - 5} more</List.Item>
                    )}
                  </List>
                  <fetcher.Form method="post">
                    <input type="hidden" name="action" value="cleanup_orphaned" />
                    <Button submit destructive loading={fetcher.state === "submitting"}>
                      🧹 Clean Up Orphaned Products
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Test Delete Webhook */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">🧪 Test Delete Webhook</Text>
            <Text variant="bodyMd">
              This will create a test product and immediately delete it to test your delete webhook.
            </Text>
            
            <fetcher.Form method="post">
              <input type="hidden" name="action" value="test_delete_webhook" />
              <Button 
                submit 
                primary 
                loading={fetcher.state === "submitting"}
                disabled={!hasDeleteWebhook}
              >
                🚀 Run Delete Test
              </Button>
            </fetcher.Form>
            
            {!hasDeleteWebhook && (
              <Text variant="bodySm" color="subdued">
                Register the delete webhook first before testing
              </Text>
            )}
          </BlockStack>
        </Card>

        {/* Action Results */}
        {fetcher.data && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">📋 Action Results</Text>
              
              {fetcher.data.action === "test_delete_webhook" && (
                <Banner 
                  status={fetcher.data.success ? "success" : "critical"}
                  title={fetcher.data.success ? "✅ Test completed" : "❌ Test failed"}
                >
                  {fetcher.data.success ? (
                    <BlockStack gap="200">
                      <Text variant="bodySm">Created product ID: {fetcher.data.createdProductId}</Text>
                      <Text variant="bodySm">Deleted product ID: {fetcher.data.deletedProductId}</Text>
                      <Text variant="bodySm">{fetcher.data.message}</Text>
                      <Text variant="bodySm"><strong>Check your application logs for delete webhook processing!</strong></Text>
                    </BlockStack>
                  ) : (
                    <Text variant="bodySm">Error: {fetcher.data.error}</Text>
                  )}
                </Banner>
              )}
              
              {fetcher.data.action === "cleanup_orphaned" && (
                <Banner 
                  status={fetcher.data.success ? "success" : "critical"}
                  title={fetcher.data.success ? "✅ Cleanup completed" : "❌ Cleanup failed"}
                >
                  {fetcher.data.success ? (
                    <BlockStack gap="200">
                      <Text variant="bodySm">Deleted {fetcher.data.deletedCount} orphaned products</Text>
                      {fetcher.data.orphanedProducts.length > 0 && (
                        <details>
                          <summary>Deleted products:</summary>
                          <List>
                            {fetcher.data.orphanedProducts.map(p => (
                              <List.Item key={p.id}>{p.title} (ID: {p.shopifyProductId})</List.Item>
                            ))}
                          </List>
                        </details>
                      )}
                    </BlockStack>
                  ) : (
                    <Text variant="bodySm">Error: {fetcher.data.error}</Text>
                  )}
                </Banner>
              )}
              
              {fetcher.data.action === "re_register_delete_webhook" && (
                <Banner 
                  status={fetcher.data.success ? "success" : "critical"}
                  title={fetcher.data.success ? "✅ Webhook registered" : "❌ Registration failed"}
                >
                  {fetcher.data.success ? (
                    <Text variant="bodySm">Delete webhook registered successfully! Webhook ID: {fetcher.data.webhookId}</Text>
                  ) : (
                    <BlockStack gap="200">
                      <Text variant="bodySm">Error: {fetcher.data.error}</Text>
                      {fetcher.data.errors?.map((error, i) => (
                        <Text key={i} variant="bodySm">• {error.message}</Text>
                      ))}
                    </BlockStack>
                  )}
                </Banner>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Debugging Checklist */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">🔍 Debugging Checklist</Text>
            <List>
              <List.Item>
                <strong>✅ Webhook Registration:</strong> {hasDeleteWebhook ? "Registered" : "❌ Missing"}
              </List.Item>
              <List.Item>
                <strong>✅ Webhook URL:</strong> {isDeleteWebhookCorrect ? "Correct" : "❌ Incorrect"}
              </List.Item>
              <List.Item>
                <strong>✅ Database Store:</strong> {store ? "Found" : "❌ Missing"}
              </List.Item>
              <List.Item>
                <strong>✅ Orphaned Products:</strong> {orphanedProducts.length === 0 ? "None" : `❌ ${orphanedProducts.length} found`}
              </List.Item>
            </List>
            
            <Banner status="info" title="💡 Common Issues">
              <List>
                <List.Item><strong>Webhook not registered:</strong> Use the register button above</List.Item>
                <List.Item><strong>Wrong URL:</strong> Check your app's public URL and route structure</List.Item>
                <List.Item><strong>Store not found:</strong> Make sure your store is properly set up in the database</List.Item>
                <List.Item><strong>Network issues:</strong> Check if Shopify can reach your webhook URL</List.Item>
                <List.Item><strong>Authentication errors:</strong> Verify webhook authentication in your logs</List.Item>
              </List>
            </Banner>
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}