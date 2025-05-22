import * as promClient from "prom-client";

// Clear all existing metrics to avoid "already registered" errors in development
promClient.register.clear();

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'shopify-sustainability-app'
});

// Enable the collection of default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Create custom metrics for sustainability tracking
const sustainableMaterialsGauge = new promClient.Gauge({
  name: 'sustainable_materials_percentage',
  help: 'Percentage of sustainable materials in products',
  labelNames: ['product_id', 'product_title', 'store_id'],
  registers: [register] // Explicitly register with our custom registry
});

const packagingRatioGauge = new promClient.Gauge({
  name: 'packaging_ratio',
  help: 'Ratio of packaging weight to product weight',
  labelNames: ['product_id', 'product_title', 'store_id'],
  registers: [register]
});

const locallyProducedGauge = new promClient.Gauge({
  name: 'locally_produced',
  help: 'Whether a product is locally produced (1 for true, 0 for false)',
  labelNames: ['product_id', 'product_title', 'store_id'],
  registers: [register]
});

const deliveryDistanceGauge = new promClient.Gauge({
  name: 'delivery_distance_km',
  help: 'Distance of delivery in kilometers',
  labelNames: ['order_id', 'store_id'],
  registers: [register]
});

const storeAvgDeliveryDistanceGauge = new promClient.Gauge({
  name: 'store_avg_delivery_distance_km',
  help: 'Average delivery distance for a store in kilometers',
  labelNames: ['store_id', 'store_name'],
  registers: [register]
});

const productStatusGauge = new promClient.Gauge({
  name: 'product_status',
  help: 'Product status (1 = active, 0 = deleted)',
  labelNames: ['product_id', 'product_title', 'store_id'],
  registers: [register]
});

// This is our metrics endpoint that Prometheus will scrape
export const loader = async () => {
  // Return the metrics in Prometheus format
  return new Response(await register.metrics(), {
    headers: {
      "Content-Type": register.contentType
    }
  });
};

// Export the metrics objects so they can be used elsewhere in the app
export const metrics = {
  register,
  sustainableMaterialsGauge,
  packagingRatioGauge,
  locallyProducedGauge,
  deliveryDistanceGauge,
  storeAvgDeliveryDistanceGauge,
  productStatusGauge
};