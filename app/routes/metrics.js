// app/routes/metrics.js
import * as promClient from "prom-client";

// Clear all existing metrics to avoid "already registered" errors in development
promClient.register.clear();

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "shopify-sustainability-app",
});

// Enable the collection of default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Create custom metrics for sustainability tracking
const sustainableMaterialsGauge = new promClient.Gauge({
  name: "sustainable_materials_percentage",
  help: "Percentage of sustainable materials in products",
  labelNames: ["product_id", "product_title", "store_id"],
  registers: [register],
});

const packagingRatioGauge = new promClient.Gauge({
  name: "packaging_ratio",
  help: "Ratio of packaging weight to product weight",
  labelNames: ["product_id", "product_title", "store_id"],
  registers: [register],
});

const locallyProducedGauge = new promClient.Gauge({
  name: "is_locally_produced",
  help: "Whether a product is locally produced (1 for true, 0 for false)",
  labelNames: ["product_id", "product_title", "store_id"],
  registers: [register],
});

const deliveryDistanceGauge = new promClient.Gauge({
  name: "delivery_distance_km",
  help: "Distance of delivery in kilometers",
  labelNames: ["order_id", "store_id"],
  registers: [register],
});

const storeAvgDeliveryDistanceGauge = new promClient.Gauge({
  name: "store_avg_delivery_distance_km",
  help: "Average delivery distance for a store in kilometers",
  labelNames: ["store_id", "store_name", "store_domain"],
  registers: [register],
});

const productStatusGauge = new promClient.Gauge({
  name: "product_status",
  help: "Product status (1 = active, 0 = deleted)",
  labelNames: ["product_id", "product_title", "store_id"],
  registers: [register],
});

// NEW: Store-level aggregated metrics
const storeProductCountGauge = new promClient.Gauge({
  name: "store_product_count",
  help: "Total number of products per store",
  labelNames: ["store_id", "store_name", "store_domain"],
  registers: [register],
});

const storeAvgSustainableMaterialsGauge = new promClient.Gauge({
  name: "store_avg_sustainable_materials",
  help: "Average sustainable materials percentage for store",
  labelNames: ["store_id", "store_name", "store_domain"],
  registers: [register],
});

const storeLocalProductsGauge = new promClient.Gauge({
  name: "store_local_products_count",
  help: "Number of locally produced products per store",
  labelNames: ["store_id", "store_name", "store_domain"],
  registers: [register],
});

// Security function to block public access
function checkAccess(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const userAgent = request.headers.get('user-agent') || '';
  const host = request.headers.get('host') || '';
  
  // Check if this is an internal request
  const isInternal = !forwarded && !realIP; // No proxy headers = internal Docker request
  const isPrometheus = userAgent.includes('Prometheus') || userAgent.includes('prometheus');
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  
  // Allow internal requests or Prometheus specifically
  if (!isInternal && !isPrometheus && !isLocalhost) {
    return false;
  }
  
  return true;
}

// This is our metrics endpoint that Prometheus will scrape
export const loader = async ({ request }) => {
  // 🔒 SECURITY CHECK - Block public access
  if (!checkAccess(request)) {
    throw new Response('Not Found', { status: 404 });
  }
  
  // Return the metrics in Prometheus format
  return new Response(await register.metrics(), {
    headers: {
      "Content-Type": register.contentType,
      "Cache-Control": "no-cache",
    },
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
  productStatusGauge,
  storeProductCountGauge,
  storeAvgSustainableMaterialsGauge,
  storeLocalProductsGauge,
};
