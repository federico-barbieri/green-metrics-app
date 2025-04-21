// app/routes/app.packagingweight.jsx
import {
  Card,
  Layout,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { gql } from "graphql-request";
import PackagingWeightMetafieldEditor from "../components/PackagingWeightMetafieldEditor";

export const loader = async ({ request }) => {
  try{
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
    console.log("First product metafields:", firstProduct.metafields.edges.map(e => ({ 
      key: e.node.key, 
      value: e.node.value 
    })));
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

  return (
    <Page>
      <TitleBar title="Packaging Weight page" />
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
              Full Product Weights
            </Text>
            <Text>
              Below is a list of all products and their total weight (product + packaging) in grams,
              along with a packaging efficiency badge based on the packaging-to-product weight ratio (PWR).
            </Text>
          </Layout.Section>

          <Layout.Section>
            <div style={{ width: "100%", marginBottom: "5rem" }}>
              <Card title="Product Weight Overview" sectioned>
                <ResourceList
                  resourceName={{ singular: "product", plural: "products" }}
                  items={products}
                  renderItem={(item) => {
                    const { id, title, combinedWeightGrams, pwrLabel, pwrStatus, pwrValue, productWeight, packagingWeight } = item;
                    return (
                      <ResourceItem id={id}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            {title}{" "}
                            <Badge status={pwrStatus}>
                              {pwrLabel} (PWR {pwrValue})
                            </Badge>
                          </Text>
                          <Text variant="bodySm" as="p">
                            Combined Weight: {combinedWeightGrams}g
                          </Text>
                        </div>
                        <PackagingWeightMetafieldEditor
                          productId={id}
                          product_weight={productWeight}
                          packaging_weight={packagingWeight}
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