// app/routes/app.debug.webhooks.jsx - FIXED VERSION with HTTPS
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Banner, Button, List } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // Fetch current webhook subscriptions
    const response = await admin.graphql(`
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
    
    const data = await response.json();
    let currentUrl = new URL(request.url).origin;
    
    // Force HTTPS for display and comparison
    if (currentUrl.startsWith('http://')) {
      currentUrl = currentUrl.replace('http://', 'https://');
    }
    
    return json({
      webhooks: data.data?.webhookSubscriptions?.edges || [],
      shop: session.shop,
      currentUrl,
      expectedWebhooks: [
        'PRODUCTS_CREATE',
        'PRODUCTS_UPDATE', 
        'PRODUCTS_DELETE',
        'ORDERS_FULFILLED',
        'APP_UNINSTALLED'
      ]
    });
  } catch (error) {
    console.error("Error fetching webhooks:", error);
    return json({
      error: error.message,
      webhooks: [],
      shop: session.shop,
      currentUrl: new URL(request.url).origin.replace('http://', 'https://'),
      expectedWebhooks: []
    });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  
  if (actionType === "register_webhooks") {
    try {
      let currentUrl = new URL(request.url).origin;
      
      // 🔥 CRITICAL FIX: Force HTTPS for webhook URLs (Shopify requirement)
      if (currentUrl.startsWith('http://')) {
        currentUrl = currentUrl.replace('http://', 'https://');
        console.log(`🔧 Converted HTTP to HTTPS: ${currentUrl}`);
      }
      
      const webhooksToRegister = [
        { topic: 'PRODUCTS_CREATE', callbackUrl: '/webhooks/products/create' },
        { topic: 'PRODUCTS_UPDATE', callbackUrl: '/webhooks/products/update' },
        { topic: 'PRODUCTS_DELETE', callbackUrl: '/webhooks/products/delete' },
        { topic: 'ORDERS_FULFILLED', callbackUrl: '/webhooks/orders/fulfilled' },
      ];

      const results = [];
      
      for (const webhook of webhooksToRegister) {
        try {
          const fullWebhookUrl = `${currentUrl}${webhook.callbackUrl}`;
          console.log(`🔧 Registering webhook: ${webhook.topic} → ${fullWebhookUrl}`);
          
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
              topic: webhook.topic,
              webhookSubscription: {
                callbackUrl: fullWebhookUrl,
                format: 'JSON'
              }
            }
          });
          
          const responseJson = await response.json();
          results.push({
            topic: webhook.topic,
            success: !responseJson.data?.webhookSubscriptionCreate?.userErrors?.length,
            errors: responseJson.data?.webhookSubscriptionCreate?.userErrors || [],
            id: responseJson.data?.webhookSubscriptionCreate?.webhookSubscription?.id,
            url: fullWebhookUrl
          });
          
        } catch (error) {
          results.push({
            topic: webhook.topic,
            success: false,
            errors: [{ message: error.message }],
            url: `${currentUrl}${webhook.callbackUrl}`
          });
        }
      }
      
      return json({ action: "register_webhooks", results, currentUrl });
    } catch (error) {
      return json({ 
        action: "register_webhooks", 
        error: error.message 
      }, { status: 500 });
    }
  }
  
  return json({ error: "Unknown action" }, { status: 400 });
};

export default function WebhookDebug() {
  const { webhooks, shop, currentUrl, expectedWebhooks, error } = useLoaderData();
  const fetcher = useFetcher();
  
  if (error) {
    return (
      <Page title="Webhook Debug - Error">
        <Banner status="critical" title="Error loading webhooks">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }
  
  const registeredTopics = webhooks.map(w => w.node.topic);
  const missingWebhooks = expectedWebhooks.filter(topic => !registeredTopics.includes(topic));
  
  return (
    <Page 
      title="🔍 Webhook Debug" 
      subtitle={`Shop: ${shop}`}
      backAction={{ content: "Back to App", url: "/app" }}
    >
      <BlockStack gap="500">
        {/* Current URL Info */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">📍 Current Configuration</Text>
            <Text variant="bodyMd">App URL: <code>{currentUrl}</code></Text>
            <Text variant="bodyMd">Shop: <code>{shop}</code></Text>
            {currentUrl.startsWith('https://') ? (
              <Banner status="success" title="✅ Using HTTPS (required by Shopify)" />
            ) : (
              <Banner status="critical" title="❌ HTTP detected - Shopify requires HTTPS for webhooks!" />
            )}
          </BlockStack>
        </Card>

        {/* Registered Webhooks */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              📋 Registered Webhooks ({webhooks.length})
            </Text>
            
            {webhooks.length === 0 ? (
              <Banner status="critical" title="❌ No webhooks registered">
                <p>Your app doesn't have any webhooks registered with Shopify. This is why your product creation isn't being detected!</p>
              </Banner>
            ) : (
              <List>
                {webhooks.map(({ node }) => {
                  const isHttps = node.endpoint?.callbackUrl?.startsWith('https://');
                  return (
                    <List.Item key={node.id}>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" weight="bold">
                          {isHttps ? '✅' : '❌'} {node.topic}
                        </Text>
                        <Text variant="bodySm" color="subdued">
                          URL: {node.endpoint?.callbackUrl || 'N/A'}
                        </Text>
                        <Text variant="bodySm" color="subdued">
                          Created: {new Date(node.createdAt).toLocaleString()}
                        </Text>
                        {!isHttps && (
                          <Text variant="bodySm" color="critical">
                            ⚠️ Using HTTP - this webhook may not work!
                          </Text>
                        )}
                      </BlockStack>
                    </List.Item>
                  );
                })}
              </List>
            )}
          </BlockStack>
        </Card>

        {/* Missing Webhooks */}
        {missingWebhooks.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                ⚠️ Missing Webhooks ({missingWebhooks.length})
              </Text>
              
              <Banner status="warning" title="Some webhooks are not registered">
                <BlockStack gap="300">
                  <p>The following webhooks are expected but not registered:</p>
                  <List>
                    {missingWebhooks.map(topic => (
                      <List.Item key={topic}>❌ {topic}</List.Item>
                    ))}
                  </List>
                  <Text variant="bodySm" color="subdued">
                    Will register with HTTPS: <code>{currentUrl}/webhooks/...</code>
                  </Text>
                </BlockStack>
              </Banner>
              
              <fetcher.Form method="post">
                <input type="hidden" name="action" value="register_webhooks" />
                <Button 
                  submit 
                  primary
                  loading={fetcher.state === "submitting"}
                >
                  🔧 Register Missing Webhooks (HTTPS)
                </Button>
              </fetcher.Form>
            </BlockStack>
          </Card>
        )}

        {/* Registration Results */}
        {fetcher.data?.action === "register_webhooks" && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">📊 Registration Results</Text>
              
              {fetcher.data.currentUrl && (
                <Text variant="bodySm" color="subdued">
                  Using base URL: <code>{fetcher.data.currentUrl}</code>
                </Text>
              )}
              
              {fetcher.data.results?.map((result, index) => (
                <Banner 
                  key={index}
                  status={result.success ? "success" : "critical"}
                  title={`${result.topic} - ${result.success ? 'Success' : 'Failed'}`}
                >
                  <BlockStack gap="200">
                    {result.url && (
                      <Text variant="bodySm">URL: <code>{result.url}</code></Text>
                    )}
                    {result.errors?.length > 0 && (
                      <List>
                        {result.errors.map((error, i) => (
                          <List.Item key={i}>{error.message}</List.Item>
                        ))}
                      </List>
                    )}
                  </BlockStack>
                </Banner>
              ))}
            </BlockStack>
          </Card>
        )}

        {/* Webhook URLs Check */}
        {webhooks.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">🔗 URL Validation</Text>
              
              {webhooks.map(({ node }) => {
                const topicPath = node.topic.toLowerCase().replace('_', '/');
                const expectedUrl = `${currentUrl}/webhooks/${topicPath}`;
                const actualUrl = node.endpoint?.callbackUrl;
                const isCorrect = actualUrl === expectedUrl;
                const isHttps = actualUrl?.startsWith('https://');
                
                return (
                  <Banner 
                    key={node.id}
                    status={isCorrect && isHttps ? "success" : "warning"}
                    title={`${node.topic} - ${isCorrect && isHttps ? '✅ URL OK' : '⚠️ Issues detected'}`}
                  >
                    <BlockStack gap="100">
                      <Text variant="bodySm">Expected: <code>{expectedUrl}</code></Text>
                      <Text variant="bodySm">Actual: <code>{actualUrl}</code></Text>
                      {!isHttps && (
                        <Text variant="bodySm" color="critical">❌ Not using HTTPS</Text>
                      )}
                      {!isCorrect && (
                        <Text variant="bodySm" color="critical">❌ URL mismatch</Text>
                      )}
                    </BlockStack>
                  </Banner>
                );
              })}
            </BlockStack>
          </Card>
        )}

        {/* Test Instructions */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">🧪 Testing Your Webhooks</Text>
            <Text variant="bodyMd">To test if your webhooks are working:</Text>
            <List>
              <List.Item><strong>Step 1:</strong> Register missing webhooks above (will use HTTPS)</List.Item>
              <List.Item><strong>Step 2:</strong> Create a new product in your Shopify admin</List.Item>
              <List.Item><strong>Step 3:</strong> Check your application logs for webhook processing messages</List.Item>
              <List.Item><strong>Step 4:</strong> Verify the product appears in your app's database</List.Item>
              <List.Item><strong>Step 5:</strong> Delete the product and verify it's removed from your database</List.Item>
            </List>
            
            <Banner status="info" title="💡 HTTPS Fix Applied">
              <p>The registration will now automatically use HTTPS URLs, which should resolve the "Address protocol http:// is not supported" error!</p>
            </Banner>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}