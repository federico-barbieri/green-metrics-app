// app/routes/app.deliverydistance.jsx
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
import haversine from "../utils/haversine";

export const loader = async ({ request }) => {
  try{
    // Authenticate the request
    const { admin } = await authenticate.admin(request);

    // Define the GraphQL query to get locally produced products
    const productQuery = gql`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
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

    const orderQuery = gql`
      query {
        orders(first: 50, query: "fulfillment_status:fulfilled") {
          edges {
            node {
              id
              name
              shippingAddress {
                latitude
                longitude
                zip
              }
            }
          }
        }
      }
    `;

    const locationQuery = gql`
      query {
        locations(first: 1, query: "active:true") {
          edges {
            node {
              address {
                latitude
                longitude
              }
            }
          }
        }
      }
    `;

    const [resProducts, resOrders, resLocation] = await Promise.all([
      admin.graphql(productQuery),
      admin.graphql(orderQuery),
      admin.graphql(locationQuery),
    ]);

    const jsonProducts = await resProducts.json();
    const jsonOrders = await resOrders.json();
    const jsonLocation = await resLocation.json();

    console.log("Orders count:", jsonOrders.data.orders.edges.length);
    console.log("Orders with shipping address:", jsonOrders.data.orders.edges.filter(e => e.node.shippingAddress).length);
    console.log("Orders with coordinates:", jsonOrders.data.orders.edges.filter(e => e.node.shippingAddress?.latitude && e.node.shippingAddress?.longitude).length);

    let depositLat = jsonLocation?.data?.locations?.edges?.[0]?.node?.address?.latitude;
    let depositLng = jsonLocation?.data?.locations?.edges?.[0]?.node?.address?.longitude;

    console.log("Deposit Location Coordinates:", depositLat, depositLng);

    if (!depositLat || !depositLng) {
      console.warn("Shop location is missing coordinates. Using fallback Copenhagen coordinates.");
      depositLat = 55.6761;
      depositLng = 12.5683;
    }

    const DEPOSIT_LOCATION = { lat: depositLat, lng: depositLng };

    const products = jsonProducts.data.products.edges.map((edge) => ({
      ...edge.node,
      metafields: edge.node.metafields.edges.map((edge) => edge.node),
    }));

    const fulfilledOrders = jsonOrders.data.orders.edges
      .map((edge) => edge.node)
      .filter((o) => o.shippingAddress);

    const zipFrequency = {};
    fulfilledOrders.forEach((order) => {
      const zip = order.shippingAddress.zip;
      if (zip) {
        zipFrequency[zip] = (zipFrequency[zip] || 0) + 1;
      }
    });

    const orderDistances = fulfilledOrders.map((order) => {
      const { latitude, longitude, zip } = order.shippingAddress;
      const distance = haversine(
        DEPOSIT_LOCATION.lat,
        DEPOSIT_LOCATION.lng,
        latitude,
        longitude
      );
      const highlightZip = zip && zipFrequency[zip] > 1;
      return { name: order.name, distance: distance.toFixed(2), zip, highlightZip };
    });

    const avgDeliveryDistance =
      orderDistances.reduce((sum, d) => sum + parseFloat(d.distance), 0) /
      (orderDistances.length || 1);

    const topZips = Object.entries(zipFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([zip, count]) => ({ zip, count }));


    return json({ products, avgDeliveryDistance: avgDeliveryDistance.toFixed(2), orderDistances, topZips });
  } catch (error) {
    console.error("Loader auth failed:", error);
    return json({ error: "Failed to load data" }, { status: 500 });
  }
};


export default function DeliveryDistance() {
  const { avgDeliveryDistance, orderDistances, topZips, error } = useLoaderData();

  const renderMetric = () => (
    <Card title="Average Delivery Distance" sectioned>
      <Text variant="bodyMd">The average distance from your warehouse to customers is:</Text>
      <Text variant="headingLg">{avgDeliveryDistance || "N/A"} km</Text>
    </Card>
  );

  const renderOrderList = () => (
    <Card title="Delivery Distances per Order" sectioned>
      {orderDistances && orderDistances.length > 0 ? (
        <ResourceList
          resourceName={{ singular: "order", plural: "orders" }}
          items={orderDistances}
          renderItem={(item) => {
            const { name, distance, highlightZip } = item;
            return (
              <ResourceItem id={name}>
                <Text variant="bodyMd">
                  {name} {highlightZip && <Badge status="info">Recurring Zip Code</Badge>}
                </Text>
                <Text variant="subdued">{distance} km</Text>
              </ResourceItem>
            );
          }}
        />
      ) : (
        <Text>No order data available</Text>
      )}
    </Card>
  );

  const renderTopZips = () => (
    <Card title="Top Zip Codes (Delivery Hotspots)" sectioned>
      <strong>Top Zip Codes (Delivery Hotspots)</strong>
      {topZips && topZips.length > 0 ? (
        topZips.map(({ zip, count }) => (
          <Text key={zip}>{zip} — {count} deliveries</Text>
        ))
      ) : (
        <Text>No delivery hotspots found</Text>
      )}
    </Card>
  );

 

  return (
    <Page title="Delivery Distance Insights">
      <TitleBar title="Delivery Distance Insights" />
      <div style={{ marginTop: "2rem", marginBottom: "2rem", width: "50%" }}>
        <Layout>
          <Layout.Section>
            {renderMetric()}
          </Layout.Section>
          <Layout.Section>
            {renderTopZips()}
          </Layout.Section>
          <Layout.Section>
            {renderOrderList()}
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}