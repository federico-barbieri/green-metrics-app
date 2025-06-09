// app/utils/prometheus.js

export class PrometheusClient {
    constructor(prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus:9090') {
      this.baseUrl = prometheusUrl;
    }
  
    async query(query, time = null) {
      const url = new URL(`${this.baseUrl}/api/v1/query`);
      url.searchParams.set('query', query);
      if (time) {
        url.searchParams.set('time', time);
      }
  
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(`Prometheus query failed: ${data.error}`);
      }
      
      return data.data.result;
    }
  
    async queryRange(query, start, end, step = '15s') {
      const url = new URL(`${this.baseUrl}/api/v1/query_range`);
      url.searchParams.set('query', query);
      url.searchParams.set('start', start);
      url.searchParams.set('end', end);
      url.searchParams.set('step', step);
  
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(`Prometheus range query failed: ${data.error}`);
      }
      
      return data.data.result;
    }
  }
  
  export async function getSustainabilityMetrics(storeId, timeRange = '24h') {
    const prometheus = new PrometheusClient();
    const now = Math.floor(Date.now() / 1000);
    const start = now - (24 * 60 * 60); // 24 hours ago
    
    
    try {
      // Current metrics (latest values) - using the exact Grafana queries
      const [
        avgSustainableMaterials,
        avgPackagingRatio,
        totalProducts,
        localProducts,
        avgDeliveryDistance
      ] = await Promise.all([
        prometheus.query(`store_avg_sustainable_materials{store_id="${storeId}"}`),
        prometheus.query(`avg(packaging_ratio{store_id="${storeId}"})`),
        prometheus.query(`store_product_count{store_id="${storeId}"}`),
        prometheus.query(`store_local_products_count{store_id="${storeId}"}`),
        prometheus.query(`store_avg_delivery_distance_km{store_id="${storeId}"}`)
      ]);
  
  
      // Time series data for trends
      const [
        sustainableMaterialsTrend,
        packagingRatioTrend,
        localProductsTrend,
        deliveryDistanceTrend
      ] = await Promise.all([
        prometheus.queryRange(
          `store_avg_sustainable_materials{store_id="${storeId}"} * 100`,
          start,
          now
        ),
        prometheus.queryRange(
          `avg(packaging_ratio{store_id="${storeId}"})`,
          start,
          now
        ),
        prometheus.queryRange(
          `store_local_products_count{store_id="${storeId}"} / store_product_count{store_id="${storeId}"} * 100`,
          start,
          now
        ),
        prometheus.queryRange(
          `store_avg_delivery_distance_km{store_id="${storeId}"}`,
          start,
          now
        )
      ]);
  
      // Calculate current values with proper null handling
      const totalProductsValue = getValue(totalProducts);
      const localProductsValue = getValue(localProducts);
      const sustainableMaterialsValue = getValue(avgSustainableMaterials);
      const packagingRatioValue = getValue(avgPackagingRatio);
      const deliveryDistanceValue = getValue(avgDeliveryDistance);

  
      return {
        current: {
          sustainableMaterialsPercent: sustainableMaterialsValue * 100,
          avgPackagingRatio: packagingRatioValue || 0,
          totalProducts: totalProductsValue || 0,
          localProducts: localProductsValue || 0,
          localProductsPercent: totalProductsValue > 0 ? (localProductsValue / totalProductsValue) * 100 : 0,
          avgDeliveryDistanceKm: deliveryDistanceValue || 0
        },
        trends: {
          sustainableMaterials: formatTimeSeriesData(sustainableMaterialsTrend),
          packagingRatio: formatTimeSeriesData(packagingRatioTrend),
          localProducts: formatTimeSeriesData(localProductsTrend),
          deliveryDistance: formatTimeSeriesData(deliveryDistanceTrend)
        }
      };
    } catch (error) {
      console.error('Error fetching sustainability metrics:', error);
      throw error;
    }
  }
  
  function getValue(prometheusResult) {
    
    if (!prometheusResult || prometheusResult.length === 0) {
      return 0;
    }
    
    const value = parseFloat(prometheusResult[0].value[1]);
    
    return isNaN(value) ? 0 : value;
  }
  
  function formatTimeSeriesData(prometheusResult) {
    if (!prometheusResult || prometheusResult.length === 0) return [];
    
    return prometheusResult[0].values.map(([timestamp, value]) => ({
      timestamp: new Date(timestamp * 1000),
      value: parseFloat(value) || 0
    }));
  }
  
  // Calculate sustainability score (0-100)
  export function calculateSustainabilityScore(metrics) {
    const {
      sustainableMaterialsPercent,
      localProductsPercent,
      avgPackagingRatio,
      avgDeliveryDistanceKm
    } = metrics.current;
  
    // Weighted scoring
    const materialScore = sustainableMaterialsPercent; // 0-100
    const localScore = localProductsPercent; // 0-100
    const packagingScore = Math.max(0, 100 - (avgPackagingRatio * 50)); // Lower ratio = better
    const distanceScore = Math.max(0, 100 - (avgDeliveryDistanceKm / 2)); // Lower distance = better
  
    const totalScore = (
      materialScore * 0.35 +
      localScore * 0.25 +
      packagingScore * 0.25 +
      distanceScore * 0.15
    );
  
    return Math.round(totalScore);
  }