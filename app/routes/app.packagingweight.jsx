// app/routes/app.packagingweight.jsx
import {
  Card,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { gql } from "graphql-request";
import PackagingWeightMetafieldEditor from "../components/PackagingWeightMetafieldEditor";

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
      console.warn(
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

      const productWeight = getValue("product_weight");
      const packagingWeight = getValue("packaging_weight");

      const combinedWeightGrams = (productWeight + packagingWeight) * 1000;
      const pwr = productWeight > 0 ? packagingWeight / productWeight : 0;

      // Determine badge status based on PWR (lenient)
      let pwrStatus = "success";
      let pwrLabel = "Excellent";

      if (pwr > 1.5) {
        pwrStatus = "critical";
        pwrLabel = "Heavy Packaging";
      } else if (pwr > 0.75) {
        pwrStatus = "warning";
        pwrLabel = "Acceptable";
      }

      return {
        id: node.id,
        title: node.title,
        combinedWeightGrams: combinedWeightGrams.toFixed(0),
        pwrLabel,
        pwrStatus,
        pwrValue: pwr.toFixed(2),
        productWeight,
        packagingWeight,
      };
    });

    return json({ products });
  } catch (error) {
    console.error("Loader auth failed:", error);
    return json({ products: [] });
  }
};

export default function PackagingWeight() {
  const { products } = useLoaderData();

  // Calculate overview statistics
  const totalProducts = products.length;
  const excellentProducts = products.filter(p => p.pwrStatus === "success").length;
  const acceptableProducts = products.filter(p => p.pwrStatus === "warning").length;
  const heavyPackagingProducts = products.filter(p => p.pwrStatus === "critical").length;
  

  // Bento Grid CSS
  const bentoGridStyles = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: '200px auto',
    gap: '1rem',
    gridTemplateAreas: `
      "overview stats efficiency"
      "productlist productlist productlist"
    `,
  };

  const bentoItemStyles = {
    overview: { gridArea: 'overview' },
    stats: { gridArea: 'stats' },
    efficiency: { gridArea: 'efficiency' },
    products: { gridArea: 'products' },
    productlist: { gridArea: 'productlist' },
  };

  const renderOverviewCard = () => (
    <Card sectioned style={{ height: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <BlockStack gap="400">
        <Text variant="headingMd" alignment="center">📦 Packaging Overview</Text>
        <Text variant="heading2xl" alignment="center">
          {totalProducts}
        </Text>
        <Text variant="bodyMd" color="subdued" alignment="center">
          Total Products Analyzed
        </Text>
      </BlockStack>
    </Card>
  );

  const renderStatsCard = () => (
    <Card sectioned style={{ height: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <BlockStack gap="300">
        <Text variant="headingMd" alignment="center">📊 PWR Distribution</Text>
        <BlockStack gap="200">
          <InlineStack justify="space-between" align="center">
            <Text variant="bodyMd">Excellent &nbsp;</Text>
            <Badge tone="success">{excellentProducts}</Badge>
          </InlineStack>
          <InlineStack justify="space-between" align="center">
            <Text variant="bodyMd">Acceptable &nbsp;</Text>
            <Badge tone="warning">{acceptableProducts}</Badge>
          </InlineStack>
          <InlineStack justify="space-between" align="center">
            <Text variant="bodyMd">Heavy Packaging &nbsp;</Text>
            <Badge tone="critical">{heavyPackagingProducts}</Badge>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  );

  const renderEfficiencyCard = () => {
    const excellentPercentage = totalProducts > 0 ? Math.round((excellentProducts / totalProducts) * 100) : 0;
    
    return (
      <Card sectioned style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <BlockStack gap="300">
          <Text variant="headingMd" alignment="center">🎯 Efficiency Score</Text>
          <Text variant="heading2xl" alignment="center">
            {excellentPercentage}%
          </Text>
          <Text variant="bodyMd" color="subdued" alignment="center">
            Products with excellent PWR
          </Text>
        </BlockStack>
      </Card>
    );
  };



  const renderProductListCard = () => (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <Text variant="headingMd">Product Weight Analysis</Text>
          <Text variant="bodyMd" color="subdued">
            Complete list of products with their total weight (product + packaging) and packaging efficiency ratings based on PWR.
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
                combinedWeightGrams,
                pwrLabel,
                pwrStatus,
                pwrValue,
                productWeight,
                packagingWeight,
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
                      <div style={{ borderRight: '1px solid #e1e3e5', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'start', justifyContent: 'space-between', height: '100%' }}>
                        <BlockStack gap="200">
                          <Text variant="bodyMd" fontWeight="bold">{title}</Text>
                          <InlineStack gap="200">
                            <Badge tone={pwrStatus}>
                              {pwrLabel} (PWR {pwrValue})
                            </Badge>
                          </InlineStack>
                        </BlockStack>
                        <BlockStack gap="100" align="center">
                          <Text variant="bodyMd" color="subdued">Combined Weight: {combinedWeightGrams}g </Text>
                        </BlockStack>
                      </div>
                     
                      <div style={{ textAlign: 'center' }}>
                        <PackagingWeightMetafieldEditor
                          productId={id}
                          product_weight={productWeight}
                          packaging_weight={packagingWeight}
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
      <TitleBar title="Packaging Weight Analysis" />
      <Box padding="600">
        <div style={bentoGridStyles}>
          <div style={bentoItemStyles.overview}>
            {renderOverviewCard()}
          </div>
          <div style={bentoItemStyles.stats}>
            {renderStatsCard()}
          </div>
          <div style={bentoItemStyles.efficiency}>
            {renderEfficiencyCard()}
          </div>
          
          <div style={bentoItemStyles.productlist}>
            {renderProductListCard()}
          </div>
        </div>
      </Box>
    </Page>
  );
}