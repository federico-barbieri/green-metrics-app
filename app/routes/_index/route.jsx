import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Button,
  BlockStack,
  Box,
  Banner,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="800">
              <BlockStack gap="600" align="center">
                <Box textAlign="center">
                  <BlockStack gap="400">
                    <Text variant="displayLarge" as="h1">
                      Sustainable Fashion Metrics
                    </Text>
                    <Text variant="bodyLg" tone="subdued" as="p">
                      Track and manage your product sustainability metrics with ease.
                      Monitor locally produced vs internationally produced items in your store.
                    </Text>
                  </BlockStack>
                </Box>

                {showForm && (
                  <Card>
                    <Box padding="600">
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Connect Your Store
                        </Text>
                        <Form method="post" action="/auth/login">
                          <BlockStack gap="400">
                            <TextField
                              label="Shop domain"
                              type="text"
                              name="shop"
                              placeholder="my-shop-domain.myshopify.com"
                              helpText="Enter your Shopify store domain"
                              autoComplete="off"
                            />
                            <Button submit variant="primary" size="large">
                              Log in
                            </Button>
                          </BlockStack>
                        </Form>
                      </BlockStack>
                    </Box>
                  </Card>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="600">
              <BlockStack gap="500">
                <Text variant="headingLg" as="h2">
                  Key Features
                </Text>
                
                <BlockStack gap="400">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h3">
                          Production Analytics
                        </Text>
                        <Text tone="subdued">
                          Get detailed insights into your locally vs internationally produced products 
                          with comprehensive ratio tracking and visual dashboards.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>

                  <Card>
                    <Box padding="400">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h3">
                          Product Management
                        </Text>
                        <Text tone="subdued">
                          Easily categorize and manage your products' production origins 
                          with intuitive metafield editing and bulk operations.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>

                  <Card>
                    <Box padding="400">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h3">
                          Sustainability Tracking
                        </Text>
                        <Text tone="subdued">
                          Monitor your store's sustainability progress and make data-driven 
                          decisions to improve your environmental impact.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            <Text>
              This application is part of a bachelor project focused on sustainable fashion metrics. 
              Connect your Shopify store to start tracking your product sustainability data.
            </Text>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}