// app/routes/app.packagingweight.jsx
import {
  Card,
  Layout,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  Divider,
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
      } else if (sustainablePercent <= 69) {
        badgeStatus = "warning";
        badgeLabel = "Moderate";
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
  }
};

export default function SustainableProducts() {
  const { products } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Sustainable Fiber Usage" />
      <Layout>
        <div
          style={{
            width: "100%",
            padding: "1rem",
            height: "100vh",
            overflowY: "scroll",
          }}
        >
          <Layout.Section>
            <Text variant="headingLg" as="h1">
              Sustainable Fiber Usage
            </Text>
            <Text>
              This list shows the percentage of sustainable fibers in each
              product. A minimum of 70% is considered sustainable.
            </Text>
          </Layout.Section>

          <Layout.Section>
            <div style={{ width: "100%", marginBottom: "5rem" }}>
              <Card title="Product Sustainability Overview" sectioned>
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
                      <ResourceItem id={id}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.3rem",
                          }}
                        >
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            {title}{" "}
                            <Badge tone={badgeStatus}>{badgeLabel}</Badge>
                          </Text>
                          <Text variant="bodySm" as="p">
                            Sustainable fiber content: {sustainablePercent}%
                          </Text>
                        </div>
                        <Divider borderColor="border" />
                        <SustainableMaterialsMetafieldEditor
                          productId={id}
                          initial_sustainable_materials={sustainablePercent}
                        />
                      </ResourceItem>
                    );
                  }}
                />
              </Card>
            </div>
          </Layout.Section>
        </div>
      </Layout>
    </Page>
  );
}
