// tests/integration/api-update-packaging-weight.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { action } from '~/routes/api.update-packaging-weight'

// Create hoisted mocks
const { mockGraphql, mockStoreFind, mockProductFind, mockProductUpdate } = vi.hoisted(() => ({
  mockGraphql: vi.fn(),
  mockStoreFind: vi.fn(),
  mockProductFind: vi.fn(),
  mockProductUpdate: vi.fn(),
}))

// Mock Shopify authentication
vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(() => Promise.resolve({
      admin: {
        graphql: mockGraphql
      },
      session: {
        shop: 'test-store.myshopify.com'
      }
    }))
  }
}))

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    store: {
      findUnique: mockStoreFind,
    },
    product: {
      findFirst: mockProductFind,
      update: mockProductUpdate,
    }
  }))
}))

// Mock metrics
vi.mock('~/utils/metrics', () => ({
  updateProductMetrics: vi.fn().mockResolvedValue(true)
}))

describe('Update Packaging Weight API', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()
    
    // Setup default successful responses
    mockStoreFind.mockResolvedValue({
      id: 'store-123',
      shopifyDomain: 'test-store.myshopify.com'
    })
    
    mockProductFind.mockResolvedValue({
      id: 'product-123',
      shopifyProductId: '789',
      title: 'Test Product',
      storeId: 'store-123'
    })
    
    mockProductUpdate.mockResolvedValue({
      id: 'product-123',
      shopifyProductId: '789',
      title: 'Test Product',
      storeId: 'store-123'
    })

    // Setup default Shopify GraphQL response
    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          productUpdate: {
            product: { id: 'gid://shopify/Product/789', title: 'Test Product' },
            userErrors: []
          }
        }
      })
    })
  })

  it('should calculate packaging ratio correctly', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 2.0,
        packaging_weight: 0.4
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // Verify packaging ratio was calculated and stored
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        productWeight: 2.0,
        packagingWeight: 0.4,
        packagingRatio: 0.2, // 0.4 / 2.0 = 0.2
        updatedAt: expect.any(Date)
      }
    })

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.product_weight).toBe('2.000')
    expect(result.packaging_weight).toBe('0.400')
  })

  it('should handle zero product weight gracefully', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 0,
        packaging_weight: 0.1
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // Should set packaging ratio to null when product weight is 0
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        productWeight: 0,
        packagingWeight: 0.1,
        packagingRatio: null, // Can't divide by zero
        updatedAt: expect.any(Date)
      }
    })

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.product_weight).toBe('0.000')
    expect(result.packaging_weight).toBe('0.100')
  })

  it('should allow zero values without enforcing minimum', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 0, // Zero should stay zero
        packaging_weight: 0 // Zero should stay zero
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.product_weight).toBe('0.000')
    expect(result.packaging_weight).toBe('0.000')
    
    // Verify database was updated with zero values
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        productWeight: 0,
        packagingWeight: 0,
        packagingRatio: null, // Can't divide by zero
        updatedAt: expect.any(Date)
      }
    })
  })

  it('should enforce weight constraints - clamp high values', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 15, // Should be clamped to 10
        packaging_weight: 12 // Should be clamped to 10
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.product_weight).toBe('10.000') // Clamped to max
    expect(result.packaging_weight).toBe('10.000') // Clamped to max
    
    // Verify database was updated with clamped values
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        productWeight: 10.0,
        packagingWeight: 10.0,
        packagingRatio: 1.0, // 10.0 / 10.0 = 1.0
        updatedAt: expect.any(Date)
      }
    })
  })

  it('should enforce weight constraints - set minimum values for non-zero', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 0.0005, // Should be set to 0.001 (minimum for non-zero)
        packaging_weight: 0.0003 // Should be set to 0.001 (minimum for non-zero)
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.product_weight).toBe('0.001') // Set to minimum
    expect(result.packaging_weight).toBe('0.001') // Set to minimum
    
    // Verify database was updated with minimum values
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        productWeight: 0.001,
        packagingWeight: 0.001,
        packagingRatio: 1.0, // 0.001 / 0.001 = 1.0
        updatedAt: expect.any(Date)
      }
    })
  })

  it('should reject invalid weight inputs', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 'invalid',
        packaging_weight: 0.5
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid number input. Values must be between 0.001 and 10.')
    
    // Should not call Shopify or database
    expect(mockGraphql).not.toHaveBeenCalled()
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should clamp negative values to minimum', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: -1.0, // Should be clamped to 0.001
        packaging_weight: -0.5 // Should be clamped to 0.001
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.product_weight).toBe('0.001') // Clamped from negative to minimum
    expect(result.packaging_weight).toBe('0.001') // Clamped from negative to minimum
    
    // Verify database was updated with clamped values
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        productWeight: 0.001,
        packagingWeight: 0.001,
        packagingRatio: 1.0, // 0.001 / 0.001 = 1.0
        updatedAt: expect.any(Date)
      }
    })
  })

  it('should handle missing required fields', async () => {
    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        // Missing product_weight and packaging_weight
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // The API doesn't explicitly check for missing fields, so parseFloat(undefined) = NaN
    // which triggers the validation error
    expect(response.status).toBe(400)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid number input. Values must be between 0.001 and 10.')
    
    // Should not call Shopify or database
    expect(mockGraphql).not.toHaveBeenCalled()
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should handle Shopify GraphQL errors', async () => {
    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          productUpdate: {
            userErrors: [{ field: 'metafields', message: 'Weight values are invalid' }]
          }
        }
      })
    })

    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 2.0,
        packaging_weight: 0.4
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual([{ field: 'metafields', message: 'Weight values are invalid' }])
    expect(result.error).toBe('Weight values are invalid') // The API joins error messages
  })

  it('should handle missing product gracefully', async () => {
    mockProductFind.mockResolvedValue(null)

    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 2.0,
        packaging_weight: 0.4
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // Based on the actual API code, missing product returns 200 with success: true
    // but databaseUpdated: false
    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(false)
    expect(result.message).toContain('Product updated in Shopify but not found in local database')
    expect(result.product_weight).toBe('2.000')
    expect(result.packaging_weight).toBe('0.400')
    
    // Verify Shopify was still called
    expect(mockGraphql).toHaveBeenCalled()
    // But database update should not have been called
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should handle missing store gracefully', async () => {
    mockStoreFind.mockResolvedValue(null)

    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 2.0,
        packaging_weight: 0.4
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // Missing store returns 200 with success: true but explains database wasn't updated
    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(false)
    expect(result.error).toBe('Store not found in database')
    expect(result.product_weight).toBe('2.000')
    expect(result.packaging_weight).toBe('0.400')
  })

  it('should handle database errors', async () => {
    mockProductUpdate.mockRejectedValue(new Error('Database connection failed'))

    const request = new Request('http://localhost/api/update-packaging-weight', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        product_weight: 2.0,
        packaging_weight: 0.4
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(500)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Database connection failed')
  })
})