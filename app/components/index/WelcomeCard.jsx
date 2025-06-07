// app/components/index/WelcomeCard.jsx
import { Card, BlockStack, Text } from "@shopify/polaris";

export default function WelcomeCard() {
  return (
    <Card sectioned>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">
          Welcome to the Green Metrics app for Shopify!
        </Text>
        <Text variant="bodyMd" as="p">
          Track sustainability metrics for your products and improve
          your store's environmental impact.
        </Text>
      </BlockStack>
    </Card>
  );
}