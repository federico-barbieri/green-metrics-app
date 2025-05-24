// tests/unit/storeMetrics.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateStoreAggregatedMetrics, updateAllStoresMetrics } from '~/utils/storeMetrics'

// Create hoisted mocks
const { 
  mockStoreFindUnique,
  mockStoreFindMany,
  mockMetricsSet 
} = vi.hoisted(() => ({
  mockStoreFindUnique: vi.fn(),
  mockStoreFindMany: vi.fn(),
  mockMetricsSet: vi.fn()
}))

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    store: {
      findUnique: mockStoreFindUnique,
      findMany: mockStoreFindMany,
    }
  }))
}))

// Mock the metrics module
vi.mock('~/routes/metrics', () => ({
  metrics: {
    storeProductCountGauge: { set: mockMetricsSet },
    storeAvgSustainableMaterialsGauge: { set: mockMetricsSet },
    storeLocalProductsGauge: { set: mockMetricsSet },
    storeAvgDeliveryDistanceGauge: { set: mockMetricsSet }
  }
}))

describe('Store Metrics Utilities', () => {
  const mockStore = {
    id: 'store-123',
    name: 'Eco Store',
    shopifyDomain: 'eco-store.myshopify.com',
    avgDeliveryDistance: 15.5,
    products: [
      {
        id: 'product-1',
        sustainableMaterials: 0.8,
        isLocallyProduced: true,
        packagingRatio: 0.1
      },
      {
        id: 'product-2',
        sustainableMaterials: 0.6,
        isLocallyProduced: false,
        packagingRatio: 0.2
      },
      {
        id: 'product-3',
        sustainableMaterials: null, // No sustainable materials data
        isLocallyProduced: true,
        packagingRatio: 0.15
      },
      {
        id: 'product-4',
        sustainableMaterials: 0.9,
        isLocallyProduced: false,
        packagingRatio: null
      }
    ]
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('updateStoreAggregatedMetrics', () => {
    it('should calculate and set all store metrics correctly', async () => {
      mockStoreFindUnique.mockResolvedValue(mockStore)

      const result = await updateStoreAggregatedMetrics('store-123')

      const expectedLabels = {
        store_id: 'store-123',
        store_name: 'Eco Store',
        store_domain: 'eco-store.myshopify.com'
      }

      // Verify all 4 metrics were set
      expect(mockMetricsSet).toHaveBeenCalledTimes(4)

      // Get all the calls to check them individually
      const calls = mockMetricsSet.mock.calls

      // Verify the specific metrics (order may vary, so check all values are present)
      const values = calls.map(call => call[1])
      
      expect(values).toContain(4) // Total product count
      expect(values).toContain(2) // Local products count  
      expect(values).toContain(15.5) // Average delivery distance
      
      // For the sustainable materials average, check it's approximately correct
      const sustainableAvg = values.find(val => val > 0.7 && val < 0.8)
      expect(sustainableAvg).toBeCloseTo(0.7666666666666667, 5)

      // Verify all calls used the correct labels
      calls.forEach(call => {
        expect(call[0]).toEqual(expectedLabels)
      })

      expect(result).toBe(true)
    })

    it('should use domain name when store name is not available', async () => {
      const storeWithoutName = {
        ...mockStore,
        name: null
      }

      mockStoreFindUnique.mockResolvedValue(storeWithoutName)

      await updateStoreAggregatedMetrics('store-123')

      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: 'eco-store' // Extracted from domain
        }),
        expect.any(Number)
      )
    })

    it('should handle store with no products', async () => {
      const storeWithNoProducts = {
        ...mockStore,
        products: []
      }

      mockStoreFindUnique.mockResolvedValue(storeWithNoProducts)

      const result = await updateStoreAggregatedMetrics('store-123')

      // Should set product count to 0
      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: 'store-123'
        }),
        0
      )

      // Should set local products count to 0
      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: 'store-123'
        }),
        0
      )

      expect(result).toBe(true)
    })

    it('should handle store with no sustainable materials data', async () => {
      const storeWithNoSustainableData = {
        ...mockStore,
        products: [
          {
            id: 'product-1',
            sustainableMaterials: null,
            isLocallyProduced: true
          },
          {
            id: 'product-2',
            sustainableMaterials: null,
            isLocallyProduced: false
          }
        ]
      }

      mockStoreFindUnique.mockResolvedValue(storeWithNoSustainableData)

      await updateStoreAggregatedMetrics('store-123')

      // Should not set sustainable materials metric when no data available
      // Verify that only certain metrics were set (count, local products, delivery distance)
      const sustainableMaterialsCalls = mockMetricsSet.mock.calls.filter(
        call => call[1] !== 2 && call[1] !== 1 && call[1] !== 15.5 // Filter out other metric values
      )
      // Should not include sustainable materials average
      expect(sustainableMaterialsCalls).toHaveLength(0)
    })

    it('should handle store without delivery distance data', async () => {
      const storeWithoutDeliveryDistance = {
        ...mockStore,
        avgDeliveryDistance: null
      }

      mockStoreFindUnique.mockResolvedValue(storeWithoutDeliveryDistance)

      await updateStoreAggregatedMetrics('store-123')

      // Should not set delivery distance metric
      expect(mockMetricsSet).not.toHaveBeenCalledWith(
        expect.any(Object),
        null
      )
    })

    it('should return false when store is not found', async () => {
      mockStoreFindUnique.mockResolvedValue(null)

      const result = await updateStoreAggregatedMetrics('nonexistent-store')

      expect(result).toBe(false)
      expect(mockMetricsSet).not.toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      mockStoreFindUnique.mockRejectedValue(new Error('Database connection failed'))

      const result = await updateStoreAggregatedMetrics('store-123')

      expect(result).toBe(false)
    })

    it('should calculate averages correctly with mixed data', async () => {
      const storeWithMixedData = {
        ...mockStore,
        products: [
          { sustainableMaterials: 1.0, isLocallyProduced: true },
          { sustainableMaterials: 0.0, isLocallyProduced: false },
          { sustainableMaterials: 0.5, isLocallyProduced: true },
          { sustainableMaterials: null, isLocallyProduced: false } // Excluded from average
        ]
      }

      mockStoreFindUnique.mockResolvedValue(storeWithMixedData)

      await updateStoreAggregatedMetrics('store-123')

      // Average should be (1.0 + 0.0 + 0.5) / 3 = 0.5
      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: 'store-123'
        }),
        0.5
      )

      // Local products count should be 2
      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: 'store-123'
        }),
        2
      )
    })
  })

  describe('updateAllStoresMetrics', () => {
    it('should update metrics for all stores', async () => {
      const mockStores = [
        { id: 'store-1' },
        { id: 'store-2' },
        { id: 'store-3' }
      ]

      mockStoreFindMany.mockResolvedValue(mockStores)
      
      // Mock individual store lookups
      mockStoreFindUnique.mockResolvedValue(mockStore)

      const result = await updateAllStoresMetrics()

      expect(mockStoreFindMany).toHaveBeenCalledWith({
        select: { id: true }
      })

      // Should have called updateStoreAggregatedMetrics for each store
      expect(mockStoreFindUnique).toHaveBeenCalledTimes(3)
      expect(mockStoreFindUnique).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        include: { products: { where: {} } }
      })

      expect(result).toBe(true)
    })

    it('should handle empty stores list', async () => {
      mockStoreFindMany.mockResolvedValue([])

      const result = await updateAllStoresMetrics()

      expect(mockStoreFindUnique).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should handle database errors gracefully', async () => {
      mockStoreFindMany.mockRejectedValue(new Error('Database error'))

      const result = await updateAllStoresMetrics()

      expect(result).toBe(false)
    })
  })
})