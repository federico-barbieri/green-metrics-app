// tests/integration/api-update-sustainable-materials.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { action } from '~/routes/api.update-sustainable-materials'

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

describe('Update Sustainable Materials API', () => {
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

  it('should format and clamp sustainable materials correctly', async () => {
    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 1.5 // Should be clamped to 1.0
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    // Check that the mutation was called with clamped value
    const mutationCall = mockGraphql.mock.calls[0][0]
    expect(mutationCall).toContain('"1.00"') // Should be formatted to 1.00

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.sustainable_materials).toBe('1.00')
    expect(result.productId).toBe('gid://shopify/Product/789')
  })

  it('should handle negative values by clamping to 0', async () => {
    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: -0.5 // Should be clamped to 0
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.sustainable_materials).toBe('0.00')

    // Check that the mutation was called with clamped value
    const mutationCall = mockGraphql.mock.calls[0][0]
    expect(mutationCall).toContain('"0.00"')
  })

  it('should handle zero values correctly', async () => {
    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 0.0
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.sustainable_materials).toBe('0.00')
  })

  it('should handle valid decimal values', async () => {
    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 0.75
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.shopifyUpdated).toBe(true)
    expect(result.databaseUpdated).toBe(true)
    expect(result.sustainable_materials).toBe('0.75')

    // Check that the mutation was called with correct formatting
    const mutationCall = mockGraphql.mock.calls[0][0]
    expect(mutationCall).toContain('"0.75"')
  })

  it('should reject invalid number input', async () => {
    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 'invalid'
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toBe('Invalid number input. Values must be between 0 and 1.')
    
    // Should not call Shopify or database
    expect(mockGraphql).not.toHaveBeenCalled()
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should reject null/undefined input', async () => {
    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: null
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.error).toBe('Invalid number input. Values must be between 0 and 1.')
  })

  it('should handle Shopify GraphQL errors', async () => {
    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          productUpdate: {
            userErrors: [{ field: 'metafields', message: 'Invalid metafield value' }]
          }
        }
      })
    })

    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 0.5
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    const response = await action({ request })
    const result = await response.json()

    expect(response.status).toBe(400)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual([{ field: 'metafields', message: 'Invalid metafield value' }])
    expect(result.error).toBe('Invalid metafield value') // The API joins error messages
  })

  it('should handle missing product gracefully', async () => {
    mockProductFind.mockResolvedValue(null)

    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 0.5
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
    expect(result.sustainable_materials).toBe('0.50')
    
    // Verify Shopify was still called
    expect(mockGraphql).toHaveBeenCalled()
    // But database update should not have been called
    expect(mockProductUpdate).not.toHaveBeenCalled()
  })

  it('should handle missing store gracefully', async () => {
    mockStoreFind.mockResolvedValue(null)

    const request = new Request('http://localhost/api/update-sustainable-materials', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'gid://shopify/Product/789',
        sustainable_materials: 0.75
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
    expect(result.sustainable_materials).toBe('0.75')
  })
})