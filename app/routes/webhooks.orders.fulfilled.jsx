// app/routes/webhooks.orders.fulfilled.jsx
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";
import haversine from "../utils/haversine";
import { updateStoreAggregatedMetrics } from "../utils/storeMetrics";

const prisma = new PrismaClient();

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);



  try {
    // Get the store
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: shop },
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
          warehouseLongitude: 12.5683,
        },
      });

    }

    // Extract order data from webhook payload
    const shopifyOrderId = payload.id.toString();
    const shopifyOrderName = payload.name;
    const shippingAddress = payload.shipping_address;


    // Skip if no shipping address
    if (!shippingAddress) {
      return new Response();
    }

    // Check if shipping address has coordinates
    if (!shippingAddress.latitude || !shippingAddress.longitude) {

      return new Response();
    }

    // Calculate delivery distance
    const deliveryDistance = haversine(
      store.warehouseLatitude,
      store.warehouseLongitude,
      shippingAddress.latitude,
      shippingAddress.longitude,
    );



    // Create or update order in database
    const updatedOrder = await prisma.order.upsert({
      where: {
        shopifyOrderId_storeId: {
          shopifyOrderId,
          storeId: store.id,
        },
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
      },
    });



    // Update the store's average delivery distance
    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        fulfilled: true,
        deliveryDistance: { not: null },
      },
      select: {
        deliveryDistance: true,
      },
    });



    if (orders.length > 0) {
      const totalDistance = orders.reduce(
        (sum, order) => sum + order.deliveryDistance,
        0,
      );
      const avgDeliveryDistance = totalDistance / orders.length;

  

      await prisma.store.update({
        where: { id: store.id },
        data: { avgDeliveryDistance },
      });

      // Update store-level aggregated metrics (including delivery distance)
      await updateStoreAggregatedMetrics(store.id);
      
    }

  } catch (error) {
    console.error(`Error handling order fulfillment: ${error.message}`);
    console.error(error.stack);
  }

  return new Response();
};
