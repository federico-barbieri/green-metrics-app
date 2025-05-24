// tests/unit/metrics.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  recordProductMetricsHistory, 
  updateProductMetrics, 
  getProductMetricsHistory 
} from '~/utils/metrics'

// Create hoisted mocks
const { 
  mockHistoryFindFirst,
  mockHistoryCreate, 
  mockHistoryFindMany,
  mockUpdateStoreMetrics,
  mockMetricsSet 
} = vi.hoisted(() => ({
  mockHistoryFindFirst: vi.fn(),
  mockHistoryCreate: vi.fn(),
  mockHistoryFindMany: vi.fn(),
  mockUpdateStoreMetrics: vi.fn(),
  mockMetricsSet: vi.fn()
}))

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    productMetricsHistory: {
      findFirst: mockHistoryFindFirst,
      create: mockHistoryCreate,
      findMany: mockHistoryFindMany,
    }
  }))
}))

// Mock store metrics
vi.mock('~/utils/storeMetrics', () => ({
  updateStoreAggregatedMetrics: mockUpdateStoreMetrics
}))

// Mock the metrics module
vi.mock('~/routes/metrics', () => ({
  metrics: {
    productStatusGauge: { set: mockMetricsSet },
    sustainableMaterialsGauge: { set: mockMetricsSet },
    packagingRatioGauge: { set: mockMetricsSet },
    locallyProducedGauge: { set: mockMetricsSet }
  }
}))

describe('Metrics Utilities', () => {
  const mockProduct = {
    id: 'product-123',
    shopifyProductId: '789',
    title: 'Eco T-Shirt',
    storeId: 'store-123',
    sustainableMaterials: 0.75,
    isLocallyProduced: true,
    packagingWeight: 0.1,
    productWeight: 0.5,
    packagingRatio: 0.2
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateStoreMetrics.mockResolvedValue(true)
  })

  describe('recordProductMetricsHistory', () => {
    it('should record history when no previous history exists', async () => {
      mockHistoryFindFirst.mockResolvedValue(null)
      mockHistoryCreate.mockResolvedValue({ id: 'history-123' })

      const result = await recordProductMetricsHistory(mockProduct)

      expect(mockHistoryFindFirst).toHaveBeenCalledWith({
        where: { productId: 'product-123' },
        orderBy: { timestamp: 'desc' }
      })

      expect(mockHistoryCreate).toHaveBeenCalledWith({
        data: {
          productId: 'product-123',
          sustainableMaterials: 0.75,
          isLocallyProduced: true,
          packagingWeight: 0.1,
          productWeight: 0.5,
          packagingRatio: 0.2
        }
      })

      expect(result).toBe(true)
    })

    it('should record history when metrics have changed', async () => {
      const lastHistory = {
        sustainableMaterials: 0.5, // Different from current 0.75
        isLocallyProduced: true,
        packagingWeight: 0.1,
        productWeight: 0.5,
        packagingRatio: 0.2
      }

      mockHistoryFindFirst.mockResolvedValue(lastHistory)
      mockHistoryCreate.mockResolvedValue({ id: 'history-124' })

      const result = await recordProductMetricsHistory(mockProduct)

      expect(mockHistoryCreate).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should not record history when no metrics have changed', async () => {
      const lastHistory = {
        sustainableMaterials: 0.75, // Same as current
        isLocallyProduced: true,    // Same as current
        packagingWeight: 0.1,       // Same as current
        productWeight: 0.5,         // Same as current
        packagingRatio: 0.2         // Same as current
      }

      mockHistoryFindFirst.mockResolvedValue(lastHistory)

      const result = await recordProductMetricsHistory(mockProduct)

      expect(mockHistoryCreate).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('should detect changes in isLocallyProduced', async () => {
      const lastHistory = {
        sustainableMaterials: 0.75,
        isLocallyProduced: false, // Different from current true
        packagingWeight: 0.1,
        productWeight: 0.5,
        packagingRatio: 0.2
      }

      mockHistoryFindFirst.mockResolvedValue(lastHistory)
      mockHistoryCreate.mockResolvedValue({ id: 'history-125' })

      const result = await recordProductMetricsHistory(mockProduct)

      expect(mockHistoryCreate).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should handle database errors gracefully', async () => {
      mockHistoryFindFirst.mockRejectedValue(new Error('Database error'))

      const result = await recordProductMetricsHistory(mockProduct)

      expect(result).toBe(false)
    })
  })

  describe('updateProductMetrics', () => {
    it('should update all metrics for a complete product', async () => {
      mockHistoryFindFirst.mockResolvedValue(null)
      mockHistoryCreate.mockResolvedValue({ id: 'history-123' })

      const result = await updateProductMetrics(mockProduct)

      // Verify Prometheus metrics were set
      expect(mockMetricsSet).toHaveBeenCalledWith(
        {
          product_id: '789',
          product_title: 'Eco T-Shirt',
          store_id: 'store-123'
        },
        1 // Product status active
      )

      expect(mockMetricsSet).toHaveBeenCalledWith(
        {
          product_id: '789',
          product_title: 'Eco T-Shirt',
          store_id: 'store-123'
        },
        0.75 // Sustainable materials
      )

      expect(mockMetricsSet).toHaveBeenCalledWith(
        {
          product_id: '789',
          product_title: 'Eco T-Shirt',
          store_id: 'store-123'
        },
        0.2 // Packaging ratio
      )

      expect(mockMetricsSet).toHaveBeenCalledWith(
        {
          product_id: '789',
          product_title: 'Eco T-Shirt',
          store_id: 'store-123'
        },
        1 // Locally produced (true = 1)
      )

      // Verify store metrics were updated
      expect(mockUpdateStoreMetrics).toHaveBeenCalledWith('store-123')

      expect(result).toBe(true)
    })

    it('should handle product without title', async () => {
      const productWithoutTitle = { ...mockProduct, title: null }

      await updateProductMetrics(productWithoutTitle)

      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          product_title: 'Product 789' // Fallback title
        }),
        expect.any(Number)
      )
    })

    it('should handle null sustainable materials', async () => {
      const productWithNullSustainable = { 
        ...mockProduct, 
        sustainableMaterials: null 
      }

      await updateProductMetrics(productWithNullSustainable)

      // Should still set other metrics but not sustainable materials
      expect(mockMetricsSet).toHaveBeenCalledTimes(3) // status, packaging, locally produced only
    })

    it('should handle false locally produced value', async () => {
      const productNotLocal = { 
        ...mockProduct, 
        isLocallyProduced: false 
      }

      await updateProductMetrics(productNotLocal)

      expect(mockMetricsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: '789'
        }),
        0 // false = 0
      )
    })

    it('should return false for missing required fields', async () => {
      const incompleteProduct = {
        id: 'product-123',
        // Missing shopifyProductId and storeId
        title: 'Test Product'
      }

      const result = await updateProductMetrics(incompleteProduct)

      expect(result).toBe(false)
      expect(mockMetricsSet).not.toHaveBeenCalled()
    })

    it('should handle metrics errors gracefully', async () => {
      mockMetricsSet.mockImplementation(() => {
        throw new Error('Prometheus error')
      })

      const result = await updateProductMetrics(mockProduct)

      // Should return false but not throw
      expect(result).toBe(false)
    })
  })

  describe('getProductMetricsHistory', () => {
    it('should retrieve history for specified days', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          productId: 'product-123',
          timestamp: new Date('2024-01-01'),
          sustainableMaterials: 0.5,
          product: {
            title: 'Eco T-Shirt',
            shopifyProductId: '789'
          }
        },
        {
          id: 'history-2',
          productId: 'product-123',
          timestamp: new Date('2024-01-02'),
          sustainableMaterials: 0.75,
          product: {
            title: 'Eco T-Shirt',
            shopifyProductId: '789'
          }
        }
      ]

      mockHistoryFindMany.mockResolvedValue(mockHistory)

      const result = await getProductMetricsHistory('product-123', 30)

      expect(mockHistoryFindMany).toHaveBeenCalledWith({
        where: {
          productId: 'product-123',
          timestamp: { gte: expect.any(Date) }
        },
        orderBy: { timestamp: 'asc' },
        include: {
          product: {
            select: {
              title: true,
              shopifyProductId: true
            }
          }
        }
      })

      expect(result).toEqual(mockHistory)
    })

    it('should use default 5 years when no days specified', async () => {
      mockHistoryFindMany.mockResolvedValue([])

      await getProductMetricsHistory('product-123')

      const call = mockHistoryFindMany.mock.calls[0][0]
      const startDate = call.where.timestamp.gte
      const daysDiff = Math.ceil((new Date() - startDate) / (1000 * 60 * 60 * 24))
      
      expect(daysDiff).toBeCloseTo(1825, 1) // 5 years ± 1 day
    })

    it('should throw error when database fails', async () => {
      mockHistoryFindMany.mockRejectedValue(new Error('Database error'))

      await expect(getProductMetricsHistory('product-123')).rejects.toThrow('Database error')
    })
  })
})