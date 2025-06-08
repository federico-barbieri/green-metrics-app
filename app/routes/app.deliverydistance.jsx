// app/routes/app.deliverydistance.jsx - Bento Grid Layout
import {
  Card,
  Page,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  Banner,
  Button,
  Box,
  BlockStack,
  InlineStack,
  Divider,
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
          name: session.shop.split(".")[0], // Basic name from domain
        },
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

      warehouseLat =
        jsonLocation?.data?.locations?.edges?.[0]?.node?.address?.latitude;
      warehouseLng =
        jsonLocation?.data?.locations?.edges?.[0]?.node?.address?.longitude;

     

      // Save the warehouse coordinates to our database
      if (warehouseLat && warehouseLng) {
        await prisma.store.update({
          where: { id: store.id },
          data: {
            warehouseLatitude: warehouseLat,
            warehouseLongitude: warehouseLng,
          },
        });
      } else {
        console.warn(
          "Shop location is missing coordinates. Using fallback Copenhagen coordinates.",
        );
        warehouseLat = 55.6761;
        warehouseLng = 12.5683;
      }
    }

    const WAREHOUSE_LOCATION = { lat: warehouseLat, lng: warehouseLng };

    // If force refresh or no orders, fetch from Shopify
    const ordersCount = await prisma.order.count({
      where: { storeId: store.id },
    });

    // If we have no orders or a force refresh is requested, fetch orders from Shopify
    if (ordersCount === 0 || forceRefresh) {
     
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
      
    

      // Process orders and save to database
      const orderPromises = ordersFromShopify.map(async (edge) => {
        const order = edge.node;
        const shopifyOrderId = order.id.replace("gid://shopify/Order/", "");
        const shippingAddress = order.shippingAddress;

        if (!shippingAddress) {
          return null;
        }

        // Calculate distance if we have coordinates
        let deliveryDistance = null;
        if (shippingAddress.latitude && shippingAddress.longitude) {
          deliveryDistance = haversine(
            WAREHOUSE_LOCATION.lat,
            WAREHOUSE_LOCATION.lng,
            shippingAddress.latitude,
            shippingAddress.longitude,
          );
          
        } 

        // Create or update order in database
        return prisma.order.upsert({
          where: {
            shopifyOrderId_storeId: {
              shopifyOrderId,
              storeId: store.id,
            },
          },
          update: {
            shopifyOrderName: order.name,
            fulfilled: true,
            deliveryAddress: shippingAddress.address1,
            deliveryCity: shippingAddress.city,
            deliveryCountry: shippingAddress.country,
            deliveryZipCode: shippingAddress.zip,
            deliveryDistance,
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
            deliveryDistance,
          },
        });
      });

      await Promise.all(orderPromises.filter((p) => p !== null));
    }

    // Always recalculate average delivery distance
    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        fulfilled: true,
        deliveryDistance: { not: null },
      },
      select: { deliveryDistance: true },
    });


    let avgDeliveryDistance = null;
    if (orders.length > 0) {
      const totalDistance = orders.reduce(
        (sum, order) => sum + order.deliveryDistance,
        0,
      );
      avgDeliveryDistance = totalDistance / orders.length;

      

      await prisma.store.update({
        where: { id: store.id },
        data: { avgDeliveryDistance },
      });
    } 

    // Get orders with distances for display
    const ordersWithDistances = await prisma.order.findMany({
      where: {
        storeId: store.id,
        fulfilled: true,
        deliveryDistance: { not: null },
      },
      select: {
        shopifyOrderName: true,
        deliveryDistance: true,
        deliveryZipCode: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate zip code frequencies for highlighting recurring zip codes
    const zipFrequency = {};
    ordersWithDistances.forEach((order) => {
      if (order.deliveryZipCode) {
        zipFrequency[order.deliveryZipCode] =
          (zipFrequency[order.deliveryZipCode] || 0) + 1;
      }
    });

    // Format orders for display
    const orderDistances = ordersWithDistances.map((order) => {
      const {
        shopifyOrderName: name,
        deliveryDistance,
        deliveryZipCode: zip,
      } = order;
      const highlightZip = zip && zipFrequency[zip] > 1;
      return {
        name,
        distance: deliveryDistance.toFixed(2),
        zip,
        highlightZip,
      };
    });

    // Get top zip codes (only those with 3+ deliveries)
    const topZips = Object.entries(zipFrequency)
      .filter(([zip, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([zip, count]) => ({ zip, count }));

    return json({
      avgDeliveryDistance: avgDeliveryDistance?.toFixed(2) || "N/A",
      orderDistances,
      topZips,
      ordersCount,
      refreshed: forceRefresh,
    });
  } catch (error) {
    console.error("Loader error:", error);
    return json({ error: "Failed to load data" }, { status: 500 });
  }
};

export default function DeliveryDistance() {
  const {
    avgDeliveryDistance,
    orderDistances,
    topZips,
    refreshed,
    error,
  } = useLoaderData();
  const submit = useSubmit();

  const handleRefresh = () => {
    submit({ refresh: "true" }, { method: "get" });
  };

  if (error) {
    return (
      <Page title="Delivery Distance Insights">
        <TitleBar title="Delivery Distance Insights" />
        <Banner title="Error loading data" tone="critical">
          <p>
            There was an error loading your delivery distance data. Please try
            again later.
          </p>
        </Banner>
      </Page>
    );
  }

  // Bento Grid CSS
  const bentoGridStyles = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'min-content auto',
    gap: '0.5rem',
    gridTemplateAreas: `
      "metric hotspots refresh"
      "orders orders orders"
    `,
  };

  const bentoItemStyles = {
    metric: { gridArea: 'metric' },
    hotspots: { gridArea: 'hotspots' },
    refresh: { gridArea: 'refresh' },
    orders: { gridArea: 'orders' },
  };

  const renderMetricCard = () => (
    <Card sectioned style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <BlockStack gap="500">
        <Text variant="headingMd" color="subdued" alignment="center">Average Delivery Distance</Text>
        <Text variant="heading2xl" alignment="center">
          {avgDeliveryDistance} km
        </Text>
        <Text variant="bodyMd" color="subdued" alignment="center">
          Distance from warehouse to customers
        </Text>
        {refreshed && (
          <Badge tone="success">Data refreshed!</Badge>
        )}
      </BlockStack>
    </Card>
  );

  const renderHotspotsCard = () => (
    <Card sectioned>
      <BlockStack gap="500">
        <Text variant="headingMd" alignment="center">Delivery Hotspots</Text>
        <Text variant="bodyMd" color="subdued" alignment="center">
          Zip codes with 3 or more deliveries
        </Text>
        {topZips && topZips.length > 0 ? (
          <BlockStack gap="200">
            {topZips.map(({ zip, count }, index) => (
              <InlineStack key={zip} justify="space-between" align="center">
                <Text variant="bodyMd">{zip}</Text>
                <Badge tone={index === 0 ? "success" : "info"}>
                  {count} deliveries
                </Badge>
              </InlineStack>
            ))}
          </BlockStack>
        ) : (
          <Text color="subdued">No hotspots found</Text>
        )}
      </BlockStack>
    </Card>
  );

  const renderRefreshCard = () => (
    <Card >
      <BlockStack gap="500" align="center">
        <Text variant="headingMd" alignment="center">Data Control</Text>
        <Button 
          onClick={handleRefresh} 
          variant="primary"
          size="large"
        >
          Refresh Data
        </Button>
        <Text variant="bodyMd" color="subdued" alignment="center">
          Sync latest orders from Shopify
        </Text>
      </BlockStack>
    </Card>
  );

  const renderOrderListCard = () => (
    <Card>
      <Box padding="400">
        <Text variant="headingMd">Recent Delivery Distances</Text>
      </Box>
      <Divider />
      {orderDistances && orderDistances.length > 0 ? (
        <Box padding="0">
          <ResourceList
            resourceName={{ singular: "order", plural: "orders" }}
            items={orderDistances.slice(0, 15)} // Show more items with full width
            renderItem={(item) => {
              const { name, distance, zip, highlightZip } = item;
              return (
                <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                  <ResourceItem id={name}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '1rem',
                      alignItems: 'center',
                      padding: '0.5rem 0'
                    }}>
                      <div style={{ borderRight: '1px solid #e1e3e5', paddingRight: '1rem' }}>
                        <BlockStack gap="100">
                          <Text variant="bodyMd" color="subdued">Order Number</Text>
                          <Text variant="bodyMd">{name}</Text>
                        </BlockStack>
                      </div>
                      <div style={{ 
                        borderRight: '1px solid #e1e3e5', 
                        paddingRight: '1rem',
                        textAlign: 'center'
                      }}>
                        <BlockStack gap="100" align="center">
                          <Text variant="bodyMd" color="subdued">Distance</Text>
                          <Text variant="headingMd">{distance} km</Text>
                        </BlockStack>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <BlockStack gap="100" align="center">
                          <Text variant="bodyMd" color="subdued">Zip Code</Text>
                          <InlineStack gap="200" align="center">
                            <Text variant="bodyMd">{zip || 'N/A'}</Text>
                            {highlightZip && (
                              <Badge tone="success">Hotspot</Badge>
                            )}
                          </InlineStack>
                        </BlockStack>
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
          <Text color="subdued">No order data available</Text>
        </Box>
      )}
    </Card>
  );

  return (
    <Page title="Delivery Distance Insights">
      <TitleBar title="Delivery Distance Insights" />
      <Box padding="600">
        <div style={bentoGridStyles}>
          <div style={bentoItemStyles.metric}>
            {renderMetricCard()}
          </div>
          <div style={bentoItemStyles.hotspots}>
            {renderHotspotsCard()}
          </div>
          <div style={bentoItemStyles.refresh}>
            {renderRefreshCard()}
          </div>
          <div style={bentoItemStyles.orders}>
            {renderOrderListCard()}
          </div>
        </div>
      </Box>
    </Page>
  );
}