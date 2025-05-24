// tests/integration/app-deliverydistance.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loader } from '~/routes/app.deliverydistance'

// Create hoisted mocks
const { 
  mockGraphql, 
  mockStoreFind, 
  mockStoreCreate, 
  mockStoreUpdate,
  mockOrderCount,
  mockOrderFindMany,
  mockOrderUpsert,
  mockHaversine
} = vi.hoisted(() => ({
  mockGraphql: vi.fn(),
  mockStoreFind: vi.fn(),
  mockStoreCreate: vi.fn(),
  mockStoreUpdate: vi.fn(),
  mockOrderCount: vi.fn(),
  mockOrderFindMany: vi.fn(),
  mockOrderUpsert: vi.fn(),
  mockHaversine: vi.fn(),
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
      create: mockStoreCreate,
      update: mockStoreUpdate,
    },
    order: {
      count: mockOrderCount,
      findMany: mockOrderFindMany,
      upsert: mockOrderUpsert,
    }
  }))
}))

// Mock haversine distance calculation
vi.mock('~/utils/haversine', () => ({
  default: mockHaversine
}))

describe('Delivery Distance Loader', () => {
  const mockStore = {
    id: 'store-123',
    shopifyDomain: 'test-store.myshopify.com',
    name: 'test-store',
    warehouseLatitude: 55.6761,
    warehouseLongitude: 12.5683,
    avgDeliveryDistance: null
  }

  const mockOrders = [
    {
      shopifyOrderName: 'Order #1001',
      deliveryDistance: 5.2,
      deliveryZipCode: '2100'
    },
    {
      shopifyOrderName: 'Order #1002', 
      deliveryDistance: 12.8,
      deliveryZipCode: '2100'
    },
    {
      shopifyOrderName: 'Order #1003',
      deliveryDistance: 8.5,
      deliveryZipCode: '2200'
    }
  ]

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()
    
    // Setup default store response
    mockStoreFind.mockResolvedValue(mockStore)
    
    // Setup default order responses
    mockOrderCount.mockResolvedValue(3)
    mockOrderFindMany.mockResolvedValue(mockOrders)
    
    // Setup default haversine calculation
    mockHaversine.mockReturnValue(10.5)
  })

  it('should calculate average delivery distance for existing store with orders', async () => {
    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })
    const result = await response.json()

    // Should find existing store
    expect(mockStoreFind).toHaveBeenCalledWith({
      where: { shopifyDomain: 'test-store.myshopify.com' }
    })

    // Should not fetch from Shopify since we have orders
    expect(mockOrderCount).toHaveBeenCalledWith({
      where: { storeId: 'store-123' }
    })

    // Should calculate average: (5.2 + 12.8 + 8.5) / 3 = 8.83
    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: 'store-123' },
      data: { avgDeliveryDistance: 8.833333333333334 }
    })

    // Should return formatted results
    expect(result.avgDeliveryDistance).toBe('8.83')
    expect(result.orderDistances).toHaveLength(3)
    expect(result.topZips).toEqual([
      { zip: '2100', count: 2 },
      { zip: '2200', count: 1 }
    ])
    expect(result.ordersCount).toBe(3)
    expect(result.refreshed).toBe(false)
  })

  it('should create new store if not found', async () => {
    mockStoreFind.mockResolvedValue(null)
    
    // Create store without warehouse coordinates to trigger location fetch
    const newStoreWithoutCoords = {
      id: 'store-123',
      shopifyDomain: 'test-store.myshopify.com',
      name: 'test-store',
      warehouseLatitude: null,
      warehouseLongitude: null,
      avgDeliveryDistance: null
    }
    
    mockStoreCreate.mockResolvedValue(newStoreWithoutCoords)
    mockOrderCount.mockResolvedValue(0)
    
    // Mock Shopify location query
    mockGraphql.mockResolvedValueOnce({
      json: () => Promise.resolve({
        data: {
          locations: {
            edges: [{
              node: {
                address: {
                  latitude: 55.6761,
                  longitude: 12.5683
                }
              }
            }]
          }
        }
      })
    })

    // Mock Shopify orders query (empty since orderCount = 0 will trigger fetch)
    mockGraphql.mockResolvedValueOnce({
      json: () => Promise.resolve({
        data: {
          orders: {
            edges: []
          }
        }
      })
    })

    // Mock the orders query for calculating average
    mockOrderFindMany.mockResolvedValue([])

    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })
    const result = await response.json()

    // Should create new store
    expect(mockStoreCreate).toHaveBeenCalledWith({
      data: {
        shopifyDomain: 'test-store.myshopify.com',
        name: 'test-store'
      }
    })

    // Should fetch warehouse location from Shopify
    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('locations(first: 1, query: "active:true")')
    )

    // Should update store with warehouse coordinates
    expect(mockStoreUpdate).toHaveBeenCalledWith({
      where: { id: 'store-123' },
      data: {
        warehouseLatitude: 55.6761,
        warehouseLongitude: 12.5683
      }
    })

    expect(result.avgDeliveryDistance).toBe('N/A')
  })

  it('should fetch orders from Shopify when force refresh is requested', async () => {
    const mockShopifyOrder = {
      id: 'gid://shopify/Order/12345',
      name: '#1001',
      shippingAddress: {
        address1: 'Test Street 1',
        city: 'Copenhagen',
        country: 'Denmark',
        zip: '2100',
        latitude: 55.7000,
        longitude: 12.6000
      }
    }

    // Mock the distance calculation result
    mockHaversine.mockReturnValue(10.5)

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          orders: {
            edges: [{ node: mockShopifyOrder }]
          }
        }
      })
    })

    mockOrderUpsert.mockResolvedValue({
      shopifyOrderId: '12345',
      shopifyOrderName: '#1001',
      deliveryDistance: 10.5
    })

    // Mock the orders query for calculating average
    const updatedOrders = [...mockOrders, {
      shopifyOrderName: '#1001',
      deliveryDistance: 10.5,
      deliveryZipCode: '2100'
    }]
    mockOrderFindMany.mockResolvedValue(updatedOrders)

    const request = new Request('http://localhost/app/deliverydistance?refresh=true')

    const response = await loader({ request })
    const result = await response.json()

    // Should fetch orders from Shopify
    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('orders(first: 50, query: "fulfillment_status:fulfilled")')
    )

    // Should calculate distance for order
    expect(mockHaversine).toHaveBeenCalledWith(
      55.6761, 12.5683, // warehouse coordinates
      55.7000, 12.6000  // shipping address coordinates
    )

    // Should upsert order with calculated distance
    expect(mockOrderUpsert).toHaveBeenCalledWith({
      where: {
        shopifyOrderId_storeId: {
          shopifyOrderId: '12345',
          storeId: 'store-123'
        }
      },
      update: expect.objectContaining({
        shopifyOrderName: '#1001',
        fulfilled: true,
        deliveryDistance: 10.5,
        deliveryAddress: 'Test Street 1',
        deliveryCity: 'Copenhagen',
        deliveryCountry: 'Denmark',
        deliveryZipCode: '2100'
      }),
      create: expect.objectContaining({
        shopifyOrderId: '12345',
        shopifyOrderName: '#1001',
        storeId: 'store-123',
        fulfilled: true,
        deliveryDistance: 10.5
      })
    })

    expect(result.refreshed).toBe(true)
  })

  it('should handle orders without shipping coordinates', async () => {
    const mockShopifyOrder = {
      id: 'gid://shopify/Order/12345',
      name: '#1001',
      shippingAddress: {
        address1: 'Test Street 1',
        city: 'Copenhagen',
        country: 'Denmark',
        zip: '2100',
        latitude: null,
        longitude: null
      }
    }

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          orders: {
            edges: [{ node: mockShopifyOrder }]
          }
        }
      })
    })

    mockOrderCount.mockResolvedValue(0) // Force fetch from Shopify
    mockOrderFindMany.mockResolvedValue([]) // No orders with distances

    const request = new Request('http://localhost/app/deliverydistance')

    await loader({ request })

    // Should upsert order with null distance
    expect(mockOrderUpsert).toHaveBeenCalledWith({
      where: {
        shopifyOrderId_storeId: {
          shopifyOrderId: '12345',
          storeId: 'store-123'
        }
      },
      update: expect.objectContaining({
        deliveryDistance: null
      }),
      create: expect.objectContaining({
        deliveryDistance: null
      })
    })

    // Should not call haversine for orders without coordinates
    expect(mockHaversine).not.toHaveBeenCalled()
  })

  it('should handle orders without shipping address', async () => {
    const mockShopifyOrder = {
      id: 'gid://shopify/Order/12345',
      name: '#1001',
      shippingAddress: null
    }

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          orders: {
            edges: [{ node: mockShopifyOrder }]
          }
        }
      })
    })

    mockOrderCount.mockResolvedValue(0) // Force fetch from Shopify

    const request = new Request('http://localhost/app/deliverydistance')

    await loader({ request })

    // Should not attempt to upsert orders without shipping address
    expect(mockOrderUpsert).not.toHaveBeenCalled()
  })

  it('should use fallback coordinates when Shopify location has no coordinates', async () => {
    const storeWithoutCoords = { ...mockStore, warehouseLatitude: null, warehouseLongitude: null }
    mockStoreFind.mockResolvedValue(storeWithoutCoords)

    // Mock Shopify location query with no coordinates
    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: {
          locations: {
            edges: [{
              node: {
                address: {
                  latitude: null,
                  longitude: null
                }
              }
            }]
          }
        }
      })
    })

    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })

    // Should not update store coordinates since none were found
    expect(mockStoreUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          warehouseLatitude: expect.any(Number),
          warehouseLongitude: expect.any(Number)
        })
      })
    )

    // Should still return valid response (using fallback coordinates internally)
    const result = await response.json()
    expect(result).toHaveProperty('avgDeliveryDistance')
  })

  it('should highlight recurring zip codes', async () => {
    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })
    const result = await response.json()

    // Order from zip 2100 appears twice, so should be highlighted
    const order2100 = result.orderDistances.find(o => o.zip === '2100')
    expect(order2100.highlightZip).toBe(true)

    // Order from zip 2200 appears once, so should not be highlighted  
    const order2200 = result.orderDistances.find(o => o.zip === '2200')
    expect(order2200.highlightZip).toBe(false)
  })

  it('should handle no orders with delivery distance', async () => {
    mockOrderFindMany.mockResolvedValue([])

    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })
    const result = await response.json()

    expect(result.avgDeliveryDistance).toBe('N/A')
    expect(result.orderDistances).toEqual([])
    expect(result.topZips).toEqual([])
  })

  it('should handle errors gracefully', async () => {
    mockStoreFind.mockRejectedValue(new Error('Database connection failed'))

    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })
    const result = await response.json()

    expect(response.status).toBe(500)
    expect(result.error).toBe('Failed to load data')
  })

  it('should format distances to 2 decimal places', async () => {
    const ordersWithPreciseDistances = [
      {
        shopifyOrderName: 'Order #1001',
        deliveryDistance: 5.123456,
        deliveryZipCode: '2100'
      }
    ]

    mockOrderFindMany.mockResolvedValue(ordersWithPreciseDistances)

    const request = new Request('http://localhost/app/deliverydistance')

    const response = await loader({ request })
    const result = await response.json()

    expect(result.orderDistances[0].distance).toBe('5.12')
    expect(result.avgDeliveryDistance).toBe('5.12')
  })
})