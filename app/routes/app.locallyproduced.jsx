import {
    Card,
    Layout,
    Link,
    List,
    Page,
    Text,
    BlockStack,
  } from "@shopify/polaris";
  import { TitleBar } from "@shopify/app-bridge-react";
  
  export default function LocallyProducedPage() {
    return (
      <Page>
        <TitleBar title="Locally Produced page" />
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  I am the locally produced page
                  <Link
                    url="https://shopify.dev/docs/apps/tools/app-bridge"
                    target="_blank"
                    removeUnderline
                  >
                    App Bridge
                  </Link>
                  .
                </Text>
               
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Resources
                </Text>
                <List>
                  <List.Item>
                    <Link
                      url="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
                      target="_blank"
                      removeUnderline
                    >
                      App nav best practices
                    </Link>
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }
  