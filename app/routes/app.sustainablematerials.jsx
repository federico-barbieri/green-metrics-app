// app/routes/app.sustainablematerials.jsx
import {
  Card,
  Layout,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  Divider,
  BlockStack,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { gql } from "graphql-request";
import SustainableMaterialsMetafieldEditor from "../components/SustainableMaterialsMetafieldEditor";

export const loader = async ({ request }) => {
  try {
    // Authenticate the request
    const { admin } = await authenticate.admin(request);

    // Define the GraphQL query to get the weight of the packaging and the product
    const query = gql`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              metafields(first: 20, namespace: "custom") {
                edges {
                  node {
                    key
                    namespace
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await admin.graphql(query);
    const jsonBody = await res.json();

    // Add debug log for first product
    if (jsonBody.data.products.edges.length > 0) {
      const firstProduct = jsonBody.data.products.edges[0].node;
      console.log(
        "First product metafields:",
        firstProduct.metafields.edges.map((e) => ({
          key: e.node.key,
          value: e.node.value,
        })),
      );
    }

    const products = jsonBody.data.products.edges.map((edge) => {
      const node = edge.node;
      const metafields = node.metafields.edges.map((edge) => edge.node);

      const getValue = (key) => {
        const metafield = metafields.find((m) => m.key === key);
        if (metafield) {
          const value = parseFloat(metafield.value);
          return isNaN(value) ? 0 : value;
        }
        return 0;
      };

      const sustainable_materials = getValue("sustainable_materials");
      const sustainablePercent = (sustainable_materials * 100).toFixed(0);

      let badgeStatus = "critical";
      let badgeLabel = "Low";

      if (sustainablePercent >= 70) {
        badgeStatus = "success";
        badgeLabel = "Sustainable";
      } else if (sustainablePercent < 70 && sustainablePercent > 40) {
        badgeStatus = "warning";
        badgeLabel = "Moderate";
      } else {
        badgeStatus = "critical";
        badgeLabel = "Low";
      }

      return {
        id: node.id,
        title: node.title,
        sustainablePercent,
        badgeLabel,
        badgeStatus,
      };
    });

    return json({ products });
  } catch (error) {
    console.error("Loader auth failed:", error);
    return json({ products: [] });
  }
};

export default function SustainableProducts() {
  const { products } = useLoaderData();

  // Calculate overview statistics
  const totalProducts = products.length;
  const sustainableProducts = products.filter(p => p.badgeStatus === "success").length;
  const moderateProducts = products.filter(p => p.badgeStatus === "warning").length;
  const lowProducts = products.filter(p => p.badgeStatus === "critical").length;
  
  const avgSustainablePercent = totalProducts > 0 
    ? (products.reduce((sum, p) => sum + parseFloat(p.sustainablePercent), 0) / totalProducts).toFixed(0)
    : 0;

  // Bento Grid CSS
  const bentoGridStyles = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: '200px auto',
    gap: '1rem',
    gridTemplateAreas: `
      "overview distribution sustainability"
      "productlist productlist productlist"
    `,
  };

  const bentoItemStyles = {
    overview: { gridArea: 'overview' },
    distribution: { gridArea: 'distribution' },
    sustainability: { gridArea: 'sustainability' },
    productlist: { gridArea: 'productlist' },
  };

  const renderOverviewCard = () => (
    <Card sectioned style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <BlockStack gap="400">
        <Text variant="headingMd" alignment="center">🌱 Materials Overview</Text>
        <Text variant="heading2xl" alignment="center">
          {totalProducts}
        </Text>
        <Text variant="bodyMd" color="subdued" alignment="center">
          Total Products Analyzed
        </Text>
      </BlockStack>
    </Card>
  );

  const renderDistributionCard = () => (
    <Card sectioned style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <BlockStack gap="300">
        <Text variant="headingMd" alignment="center">📊 Sustainability Distribution</Text>
        <BlockStack gap="200">
          <InlineStack justify="space-between" align="center">
            <Text variant="bodyMd">Sustainable (70%+) &nbsp;</Text>
            <Badge tone="success">{sustainableProducts}</Badge>
          </InlineStack>
          <InlineStack justify="space-between" align="center">
            <Text variant="bodyMd">Moderate (40-70%) &nbsp;</Text>
            <Badge tone="warning">{moderateProducts}</Badge>
          </InlineStack>
          <InlineStack justify="space-between" align="center">
            <Text variant="bodyMd">Low (0-40%) &nbsp;</Text>
            <Badge tone="critical"> {lowProducts}</Badge>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  );

  const renderSustainabilityCard = () => {
    const sustainablePercentage = totalProducts > 0 ? Math.round((sustainableProducts / totalProducts) * 100) : 0;
    
    return (
      <Card sectioned style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <BlockStack gap="300">
          <Text variant="headingMd" alignment="center">🎯 Sustainability Score</Text>
          <Text variant="heading2xl" alignment="center">
            {sustainablePercentage}%
          </Text>
          <Text variant="bodyMd" color="subdued" alignment="center">
            70% or higher sustainable materials
          </Text>
        </BlockStack>
      </Card>
    );
  };

  const renderProductListCard = () => (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <Text variant="headingMd">Sustainable Fiber Analysis</Text>
          <Text variant="bodyMd" color="subdued">
            Complete list of products showing sustainable fiber content. A minimum of 70% is considered sustainable.
          </Text>
        </BlockStack>
      </Box>
      <Divider />
      {products && products.length > 0 ? (
        <Box padding="0">
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={products}
            renderItem={(item) => {
              const {
                id,
                title,
                sustainablePercent,
                badgeLabel,
                badgeStatus,
              } = item;
              return (
                <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                  <ResourceItem id={id}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.5rem',
                      alignItems: 'center',
                      padding: '0.5rem 0'
                    }}>
                      <div style={{ borderRight: '1px solid #e1e3e5', paddingRight: '0.5rem' }}>
                        <BlockStack gap="200">
                          <Text variant="bodyMd" fontWeight="bold">{title}</Text>
                          <InlineStack gap="200">
                            <Badge tone={badgeStatus}>
                              {badgeLabel}
                            </Badge>
                          </InlineStack>
                          <Text variant="bodyMd" color="subdued">
                            Sustainable fiber content: {sustainablePercent}%
                          </Text>
                        </BlockStack>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <SustainableMaterialsMetafieldEditor
                          productId={id}
                          initial_sustainable_materials={sustainablePercent}
                        />
                      </div>
                    </div>
                  </ResourceItem>
                </div>
              );
            }}
          />
        </Box>
      ) : (
        <Box padding="400">
          <Text color="subdued">No products available</Text>
        </Box>
      )}
    </Card>
  );

  return (
    <Page>
      <TitleBar title="Sustainable Fiber Usage" />
      <Box padding="600">
        <div style={bentoGridStyles}>
          <div style={bentoItemStyles.overview}>
            {renderOverviewCard()}
          </div>
          <div style={bentoItemStyles.distribution}>
            {renderDistributionCard()}
          </div>
          <div style={bentoItemStyles.sustainability}>
            {renderSustainabilityCard()}
          </div>
          <div style={bentoItemStyles.productlist}>
            {renderProductListCard()}
          </div>
        </div>
      </Box>
    </Page>
  );
}
