// app/routes/webhooks.orders.fulfilled.jsx
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import haversine from "../utils/haversine";
import { updateOrderMetrics, updateStoreMetrics } from "../utils/metrics"; // Import metrics utilities

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Webhook payload:", JSON.stringify(payload, null, 2));

  try {
    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop }
    });
    
    if (!store) {
      console.error(`Store not found: ${shop}`);
      return new Response();
    }
    
    // Check for warehouse coordinates
    if (!store.warehouseLatitude || !store.warehouseLongitude) {
      console.error(`Warehouse coordinates not set for store: ${shop}`);
      
      // Set default coordinates if missing
      await prisma.store.update({
        where: { id: store.id },
        data: {
          warehouseLatitude: 55.6761,
          warehouseLongitude: 12.5683
        }
      });
      
      console.log("Set default warehouse coordinates to Copenhagen");
    }
    
    console.log("Warehouse coordinates:", store.warehouseLatitude, store.warehouseLongitude);
    
    // Extract order data from webhook payload
    const shopifyOrderId = payload.id.toString();
    const shopifyOrderName = payload.name;
    const shippingAddress = payload.shipping_address;
    
    // Log shipping address details
    console.log("Order shipping address:", JSON.stringify(shippingAddress, null, 2));
    
    // Skip if no shipping address
    if (!shippingAddress) {
      console.log(`Order ${shopifyOrderName} has no shipping address`);
      return new Response();
    }
    
    // Check if shipping address has coordinates
    if (!shippingAddress.latitude || !shippingAddress.longitude) {
      console.log(`Order ${shopifyOrderName} shipping address missing coordinates`);
      return new Response();
    }
    
    // Calculate delivery distance
    const deliveryDistance = haversine(
      store.warehouseLatitude,
      store.warehouseLongitude,
      shippingAddress.latitude,
      shippingAddress.longitude
    );
    
    console.log(`Calculated delivery distance for order ${shopifyOrderName}: ${deliveryDistance.toFixed(2)} km`);
    
    // Create or update order in database
    const updatedOrder = await prisma.order.upsert({
      where: {
        shopifyOrderId_storeId: {
          shopifyOrderId,
          storeId: store.id
        }
      },
      update: {
        shopifyOrderName,
        fulfilled: true,
        deliveryAddress: shippingAddress.address1,
        deliveryCity: shippingAddress.city,
        deliveryCountry: shippingAddress.country,
        deliveryZipCode: shippingAddress.zip,
        deliveryDistance,
      },
      create: {
        shopifyOrderId,
        shopifyOrderName,
        storeId: store.id,
        fulfilled: true,
        deliveryAddress: shippingAddress.address1,
        deliveryCity: shippingAddress.city,
        deliveryCountry: shippingAddress.country,
        deliveryZipCode: shippingAddress.zip,
        deliveryDistance,
      }
    });
    
    console.log(`Order ${shopifyOrderName} saved to database`);
    
    // Update Prometheus metrics for the order
    await updateOrderMetrics(updatedOrder);
    console.log(`Metrics updated for order: ${shopifyOrderName}`);
    
    // Update the store's average delivery distance
    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        fulfilled: true,
        deliveryDistance: { not: null }
      },
      select: {
        deliveryDistance: true
      }
    });
    
    console.log(`Found ${orders.length} orders with delivery distance in database`);
    
    if (orders.length > 0) {
      const totalDistance = orders.reduce((sum, order) => sum + order.deliveryDistance, 0);
      const avgDeliveryDistance = totalDistance / orders.length;
      
      console.log(`Updated average delivery distance: ${avgDeliveryDistance.toFixed(2)} km`);
      
      const updatedStore = await prisma.store.update({
        where: { id: store.id },
        data: { avgDeliveryDistance }
      });
      
      // Update Prometheus metrics for the store
      await updateStoreMetrics(updatedStore);
      console.log(`Store metrics updated with new average delivery distance: ${avgDeliveryDistance.toFixed(2)} km`);
    }
    
    console.log(`Order ${shopifyOrderName} processed for delivery distance`);
    
  } catch (error) {
    console.error(`Error handling order fulfillment: ${error.message}`);
    console.error(error.stack);
  }

  return new Response();
};