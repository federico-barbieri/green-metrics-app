// app/components/index/SidebarInfo.jsx
import { BlockStack, Card, Text, List } from "@shopify/polaris";

export default function SidebarInfo() {
  return (
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Sustainability Metrics
          </Text>
          <List>
            <List.Item>Track product origins</List.Item>
            <List.Item>Monitor shipping distances</List.Item>
            <List.Item>Manage packaging efficiency</List.Item>
            <List.Item>Display sustainability badges</List.Item>
          </List>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Developed by Mercive - The Shopify Agency -
          </Text>
          <Text variant="bodyMd" as="p">
            Mercive is a Shopify agency focused on building sustainable
            and high-performance e-commerce solutions. We help brands
            optimize their stores for speed, sustainability, and growth.
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}