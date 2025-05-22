// app/routes/app.deliverydistance.jsx - Updated with forced recalculation
import {
  Card,
  Layout,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  Banner,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import haversine from "../utils/haversine";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  try {
    // Check for refresh parameter
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";
    
    // Authenticate the request
    const { admin, session } = await authenticate.admin(request);
    
    // Get or create store in our database
    let store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop },
    });
    
    if (!store) {
      store = await prisma.store.create({
        data: {
          shopifyDomain: session.shop,
          name: session.shop.split('.')[0] // Basic name from domain
        }
      });
    }

    // Get warehouse location (deposit location)
    let warehouseLat = store.warehouseLatitude;
    let warehouseLng = store.warehouseLongitude;
    
    // If we don't have warehouse coordinates in our DB, try to get them from Shopify
    if (!warehouseLat || !warehouseLng) {
      const locationQuery = `
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
      
      const resLocation = await admin.graphql(locationQuery);
      const jsonLocation = await resLocation.json();
      
      warehouseLat = jsonLocation?.data?.locations?.edges?.[0]?.node?.address?.latitude;
      warehouseLng = jsonLocation?.data?.locations?.edges?.[0]?.node?.address?.longitude;
      
      console.log("Warehouse Location Coordinates:", warehouseLat, warehouseLng);
      
      // Save the warehouse coordinates to our database
      if (warehouseLat && warehouseLng) {
        await prisma.store.update({
          where: { id: store.id },
          data: {
            warehouseLatitude: warehouseLat,
            warehouseLongitude: warehouseLng
          }
        });
      } else {
        console.warn("Shop location is missing coordinates. Using fallback Copenhagen coordinates.");
        warehouseLat = 55.6761;
        warehouseLng = 12.5683;
      }
    }

    const WAREHOUSE_LOCATION = { lat: warehouseLat, lng: warehouseLng };
    
    // If force refresh or no orders, fetch from Shopify
    const ordersCount = await prisma.order.count({
      where: { storeId: store.id }
    });
    
    // If we have no orders or a force refresh is requested, fetch orders from Shopify
    if (ordersCount === 0 || forceRefresh) {
      console.log("Fetching orders from Shopify (ordersCount:", ordersCount, ", forceRefresh:", forceRefresh, ")");
      const orderQuery = `
        query {
          orders(first: 50, query: "fulfillment_status:fulfilled") {
            edges {
              node {
                id
                name
                shippingAddress {
                  address1
                  city
                  country
                  zip
                  latitude
                  longitude
                }
              }
            }
          }
        }
      `;
      
      const resOrders = await admin.graphql(orderQuery);
      const jsonOrders = await resOrders.json();
      
      const ordersFromShopify = jsonOrders.data.orders.edges;
      console.log("Orders count from Shopify:", ordersFromShopify.length);
      console.log("Orders with shipping address:", 
        ordersFromShopify.filter(e => e.node.shippingAddress).length);
      console.log("Orders with coordinates:", 
        ordersFromShopify.filter(e => {
          const addr = e.node.shippingAddress;
          return addr?.latitude && addr?.longitude;
        }).length);
      
      // Process orders and save to database
      const orderPromises = ordersFromShopify.map(async (edge) => {
        const order = edge.node;
        const shopifyOrderId = order.id.replace('gid://shopify/Order/', '');
        const shippingAddress = order.shippingAddress;
        
        if (!shippingAddress) {
          console.log(`Order ${order.name} has no shipping address`);
          return null;
        }
        
        // Calculate distance if we have coordinates
        let deliveryDistance = null;
        if (shippingAddress.latitude && shippingAddress.longitude) {
          deliveryDistance = haversine(
            WAREHOUSE_LOCATION.lat,
            WAREHOUSE_LOCATION.lng,
            shippingAddress.latitude,
            shippingAddress.longitude
          );
          console.log(`Order ${order.name} delivery distance: ${deliveryDistance.toFixed(2)} km`);
        } else {
          console.log(`Order ${order.name} missing coordinates in shipping address`);
        }
        
        // Create or update order in database
        return prisma.order.upsert({
          where: {
            shopifyOrderId_storeId: {
              shopifyOrderId,
              storeId: store.id
            }
          },
          update: {
            shopifyOrderName: order.name,
            fulfilled: true,
            deliveryAddress: shippingAddress.address1,
            deliveryCity: shippingAddress.city,
            deliveryCountry: shippingAddress.country,
            deliveryZipCode: shippingAddress.zip,
            deliveryDistance
          },
          create: {
            shopifyOrderId,
            shopifyOrderName: order.name,
            storeId: store.id,
            fulfilled: true,
            deliveryAddress: shippingAddress.address1,
            deliveryCity: shippingAddress.city,
            deliveryCountry: shippingAddress.country,
            deliveryZipCode: shippingAddress.zip,
            deliveryDistance
          }
        });
      });
      
      await Promise.all(orderPromises.filter(p => p !== null));
      console.log("Orders processed and saved to database");
    }
    
    // Always recalculate average delivery distance
    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        fulfilled: true,
        deliveryDistance: { not: null }
      },
      select: { deliveryDistance: true }
    });
    
    console.log("Orders with delivery distance in database:", orders.length);
    
    let avgDeliveryDistance = null;
    if (orders.length > 0) {
      const totalDistance = orders.reduce((sum, order) => sum + order.deliveryDistance, 0);
      avgDeliveryDistance = totalDistance / orders.length;
      
      console.log("Calculated average delivery distance:", avgDeliveryDistance.toFixed(2), "km");
      
      await prisma.store.update({
        where: { id: store.id },
        data: { avgDeliveryDistance }
      });
    } else {
      console.log("No orders with delivery distance found");
    }
    
    // Get orders with distances for display
    const ordersWithDistances = await prisma.order.findMany({
      where: {
        storeId: store.id,
        fulfilled: true,
        deliveryDistance: { not: null }
      },
      select: {
        shopifyOrderName: true,
        deliveryDistance: true,
        deliveryZipCode: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Calculate zip code frequencies for highlighting recurring zip codes
    const zipFrequency = {};
    ordersWithDistances.forEach(order => {
      if (order.deliveryZipCode) {
        zipFrequency[order.deliveryZipCode] = (zipFrequency[order.deliveryZipCode] || 0) + 1;
      }
    });
    
    // Format orders for display
    const orderDistances = ordersWithDistances.map(order => {
      const { shopifyOrderName: name, deliveryDistance, deliveryZipCode: zip } = order;
      const highlightZip = zip && zipFrequency[zip] > 1;
      return {
        name,
        distance: deliveryDistance.toFixed(2),
        zip,
        highlightZip
      };
    });
    
    // Get top zip codes
    const topZips = Object.entries(zipFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([zip, count]) => ({ zip, count }));

    return json({
      avgDeliveryDistance: avgDeliveryDistance?.toFixed(2) || "N/A",
      orderDistances,
      topZips,
      ordersCount,
      refreshed: forceRefresh
    });
  } catch (error) {
    console.error("Loader error:", error);
    return json({ error: "Failed to load data" }, { status: 500 });
  }
};

export default function DeliveryDistance() {
  const { avgDeliveryDistance, orderDistances, topZips, ordersCount, refreshed, error } = useLoaderData();
  const submit = useSubmit();

  const handleRefresh = () => {
    submit({ refresh: "true" }, { method: "get" });
  };

  if (error) {
    return (
      <Page title="Delivery Distance Insights">
        <TitleBar title="Delivery Distance Insights" />
        <Banner title="Error loading data" tone="critical">
          <p>There was an error loading your delivery distance data. Please try again later.</p>
        </Banner>
      </Page>
    );
  }

  const renderMetric = () => (
    <Card title="Average Delivery Distance" sectioned>
      <Text variant="bodyMd">The average distance from your warehouse to customers is:</Text>
      <Text variant="headingLg">{avgDeliveryDistance} km</Text>
      <div style={{ marginTop: "1rem" }}>
        <Button onClick={handleRefresh}>
          Refresh Data
        </Button>
        {refreshed && (
          <div style={{ marginTop: "0.5rem" }}>
            <Text variant="bodyMd" color="success">Data refreshed!</Text>
          </div>
        )}
      </div>
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
                  {name} {highlightZip && <Badge tone="success" status="info">Recurring Zip Code</Badge>}
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
      <Text variant="headingMd">Top Zip Codes (Delivery Hotspots)</Text>
      {topZips && topZips.length > 0 ? (
        topZips.map(({ zip, count }) => (
          <Text key={zip}>{zip} — {count} deliveries</Text>
        ))
      ) : (
        <Text>No delivery hotspots found</Text>
      )}
    </Card>
  );

  const renderDebugInfo = () => (
    <Card title="Debug Information" sectioned>
      <Text variant="bodyMd">Total orders in database: {ordersCount}</Text>
      <Text variant="bodyMd">Orders with delivery distance: {orderDistances?.length || 0}</Text>
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
          <Layout.Section>
            {renderDebugInfo()}
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}