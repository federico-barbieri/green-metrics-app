import {
  Card,
  Layout,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { gql } from "graphql-request";
import LocallyProducedMetafieldEditor from "../components/LocallyProducedMetafieldEditor";

export const loader = async ({ request }) => {
  try {
    // Authenticate the request
    const { admin } = await authenticate.admin(request);

    // Define the GraphQL query to get locally produced products
    const query = gql`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              metafields(first: 20) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;

    // store the query result in a variable
    const res = await admin.graphql(query);
    const jsonBody = await res.json();

    // store the products in a variable
    const products = jsonBody.data.products.edges.map((edge) => {
      const metafields = edge.node.metafields.edges.map((edge) => edge.node);
      const locallyProducedValue =
        metafields.find((m) => m.key === "locally_produced")?.value === "true";

      return {
        ...edge.node,
        metafields,
        locally_produced: locallyProducedValue, // add this boolean explicitly
      };
    });

    // Filter the products based on the locally produced metafield
    const locallyProduced = products.filter((p) => p.locally_produced);
    const internationallyProduced = products.filter((p) => !p.locally_produced);

    return json({ locallyProduced, internationallyProduced });

    // here ends the try block
  } catch (error) {
    console.error("Loader auth failed:", error);
  }
};

export default function LocallyProducedPage() {
  const { locallyProduced, internationallyProduced } = useLoaderData();

  const renderProductList = (products, labelColor, labelText) => (
    <Box width="50%">
      <Card title={labelText} sectioned>
        <ResourceList
          resourceName={{ singular: "product", plural: "products" }}
          items={products}
          renderItem={(item) => {
            const { id, title, locally_produced } = item;
            return (
              <ResourceItem id={id}>
                <div
                  style={{
                    gap: "1rem",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Text variant="bodyMd" fontWeight="bold" as="h3">
                    {title}{" "}
                    <Badge tone={labelColor} status={labelColor}>
                      {labelText}
                    </Badge>
                  </Text>
                </div>
                <LocallyProducedMetafieldEditor
                  productId={id}
                  locally_produced={locally_produced}
                />
              </ResourceItem>
            );
          }}
        />
      </Card>
    </Box>
  );

  return (
    <Page>
      <TitleBar title="Locally Produced page" />
      <Layout>
        <Layout.Section>
          <Text variant="headingLg" as="h1">
            Locally produced ratio:{" "}
            {(
              (locallyProduced.length /
                (locallyProduced.length + internationallyProduced.length)) *
              100
            ).toFixed(0)}
            %
          </Text>
          <Text>
            We found {locallyProduced.length} locally produced products and{" "}
            {internationallyProduced.length} internationally produced products.
          </Text>
        </Layout.Section>
        <Layout.Section>
          <Text>
            Toggle the checkbox if your product's production place has changed.
          </Text>
        </Layout.Section>

        {/* two halves, automatically 50% each */}
        <Layout.Section oneHalf>
          {renderProductList(locallyProduced, "success", "Locally Produced")}
        </Layout.Section>

        <Layout.Section oneHalf>
          {renderProductList(
            internationallyProduced,
            "attention",
            "Internationally Produced",
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
