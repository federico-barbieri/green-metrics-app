// tests/integration/api-update-locally-produced.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { action } from '~/routes/api.update-locally-produced'

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

describe('Update Locally Produced API', () => {
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
      storeId: 'store-123',
      isLocallyProduced: true
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

  it('should successfully update locally produced status', async () => {
    const request = new Request('http://localhost/api/update-locally-produced', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        locally_produced: true
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // Verify Shopify GraphQL was called
    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('productUpdate')
    )
    
    // Verify database was updated
    expect(mockProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-123' },
      data: {
        isLocallyProduced: true,
        updatedAt: expect.any(Date)
      }
    })

    // Verify response
    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
  })

  it('should reject invalid boolean input', async () => {
    const request = new Request('http://localhost/api/update-locally-produced', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        locally_produced: 'invalid'
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid boolean input')

    // Should not call Shopify or database
    expect(mockGraphql).not.toHaveBeenCalled()
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should handle Shopify GraphQL errors', async () => {
    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          productUpdate: {
            userErrors: [{ field: 'metafields', message: 'Invalid metafield' }]
          }
        }
      })
    })

    const request = new Request('http://localhost/api/update-locally-produced', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        locally_produced: true
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual([{ field: 'metafields', message: 'Invalid metafield' }])
  })

  it('should handle missing store gracefully', async () => {
    mockStoreFind.mockResolvedValue(null)

    const request = new Request('http://localhost/api/update-locally-produced', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        locally_produced: true
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(500)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Store not found in database')
  })

  it('should handle missing product gracefully', async () => {
    mockProductFind.mockResolvedValue(null)

    const request = new Request('http://localhost/api/update-locally-produced', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        locally_produced: true
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
    
    // Verify Shopify was still called (since it updates Shopify regardless)
    expect(mockGraphql).toHaveBeenCalled()
    // But database update should not have been called since product wasn't found
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should handle database errors gracefully', async () => {
    // Mock Shopify to succeed, but database to fail
    mockProductUpdate.mockRejectedValue(new Error('Database connection failed'))

    const request = new Request('http://localhost/api/update-locally-produced', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        locally_produced: true
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