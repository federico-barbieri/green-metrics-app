// tests/integration/app-sustainablematerials.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loader } from '~/routes/app.sustainablematerials'

// Create hoisted mocks
const { mockGraphql } = vi.hoisted(() => ({
  mockGraphql: vi.fn()
}))

// Mock Shopify authentication
vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(() => Promise.resolve({
      admin: {
        graphql: mockGraphql
      }
    }))
  }
}))

describe('Sustainable Materials Loader', () => {
  const mockProductsResponse = {
    data: {
      products: {
        edges: [
          {
            node: {
              id: 'gid://shopify/Product/123',
              title: 'Eco Cotton T-Shirt',
              handle: 'eco-cotton-tshirt',
              metafields: {
                edges: [
                  {
                    node: {
                      key: 'sustainable_materials',
                      namespace: 'custom',
                      value: '0.85'
                    }
                  },
                  {
                    node: {
                      key: 'other_field',
                      namespace: 'custom', 
                      value: 'some_value'
                    }
                  }
                ]
              }
            }
          },
          {
            node: {
              id: 'gid://shopify/Product/456',
              title: 'Regular Polyester Shirt',
              handle: 'regular-polyester-shirt',
              metafields: {
                edges: [
                  {
                    node: {
                      key: 'sustainable_materials',
                      namespace: 'custom',
                      value: '0.30'
                    }
                  }
                ]
              }
            }
          },
          {
            node: {
              id: 'gid://shopify/Product/789',
              title: 'Hemp Blend Pants',
              handle: 'hemp-blend-pants',
              metafields: {
                edges: [
                  {
                    node: {
                      key: 'sustainable_materials',
                      namespace: 'custom',
                      value: '0.65'
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch and transform products with sustainable materials data', async () => {
    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve(mockProductsResponse)
    })

    const request = new Request('http://localhost/app/sustainablematerials')
    const response = await loader({ request })
    const result = await response.json()

    // Verify GraphQL query was called
    expect(mockGraphql).toHaveBeenCalledWith(
      expect.stringContaining('products(first: 50)')
    )

    // Verify response structure
    expect(result).toHaveProperty('products')
    expect(result.products).toHaveLength(3)

    // Verify first product (85% sustainable = "Sustainable")
    expect(result.products[0]).toEqual({
      id: 'gid://shopify/Product/123',
      title: 'Eco Cotton T-Shirt',
      sustainablePercent: '85',
      badgeLabel: 'Sustainable',
      badgeStatus: 'success'
    })

    // Verify second product (30% sustainable = "Low" since ≤40%)
    expect(result.products[1]).toEqual({
      id: 'gid://shopify/Product/456',
      title: 'Regular Polyester Shirt',
      sustainablePercent: '30',
      badgeLabel: 'Low',
      badgeStatus: 'critical'
    })

    // Verify third product (65% sustainable = "Moderate") 
    expect(result.products[2]).toEqual({
      id: 'gid://shopify/Product/789',
      title: 'Hemp Blend Pants',
      sustainablePercent: '65',
      badgeLabel: 'Moderate',
      badgeStatus: 'warning'
    })
  })

  it('should handle products without sustainable materials metafield', async () => {
    const productsWithoutMetafields = {
      data: {
        products: {
          edges: [
            {
              node: {
                id: 'gid://shopify/Product/999',
                title: 'Product Without Metafields',
                handle: 'product-without-metafields',
                metafields: {
                  edges: [] // No metafields
                }
              }
            }
          ]
        }
      }
    }

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve(productsWithoutMetafields)
    })

    const request = new Request('http://localhost/app/sustainablematerials')
    const response = await loader({ request })
    const result = await response.json()

    expect(result.products[0]).toEqual({
      id: 'gid://shopify/Product/999',
      title: 'Product Without Metafields',
      sustainablePercent: '0', // Default to 0 = "Low" since ≤40%
      badgeLabel: 'Low',
      badgeStatus: 'critical'
    })
  })

  it('should handle invalid sustainable materials values', async () => {
    const productsWithInvalidValues = {
      data: {
        products: {
          edges: [
            {
              node: {
                id: 'gid://shopify/Product/111',
                title: 'Product With Invalid Value',
                handle: 'product-invalid',
                metafields: {
                  edges: [
                    {
                      node: {
                        key: 'sustainable_materials',
                        namespace: 'custom',
                        value: 'invalid_number'
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    }

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve(productsWithInvalidValues)
    })

    const request = new Request('http://localhost/app/sustainablematerials')
    const response = await loader({ request })
    const result = await response.json()

    expect(result.products[0]).toEqual({
      id: 'gid://shopify/Product/111',
      title: 'Product With Invalid Value',
      sustainablePercent: '0', // Should default to 0 = "Low" since ≤40%
      badgeLabel: 'Low',
      badgeStatus: 'critical'
    })
  })

  it('should handle empty products response', async () => {
    const emptyProductsResponse = {
      data: {
        products: {
          edges: []
        }
      }
    }

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve(emptyProductsResponse)
    })

    const request = new Request('http://localhost/app/sustainablematerials')
    const response = await loader({ request })
    const result = await response.json()

    expect(result.products).toEqual([])
  })

  it('should handle GraphQL errors gracefully', async () => {
    mockGraphql.mockRejectedValue(new Error('GraphQL error'))

    const request = new Request('http://localhost/app/sustainablematerials')
    const response = await loader({ request })

    // Since the loader catches errors but doesn't return anything,
    // response should be undefined
    expect(response).toBeUndefined()
  })

  it('should calculate badge status correctly for boundary values', async () => {
    const boundaryValueProducts = {
      data: {
        products: {
          edges: [
            {
              node: {
                id: 'gid://shopify/Product/boundary1',
                title: 'Exactly 70% Sustainable',
                handle: 'exactly-70',
                metafields: {
                  edges: [
                    {
                      node: {
                        key: 'sustainable_materials',
                        namespace: 'custom',
                        value: '0.70'
                      }
                    }
                  ]
                }
              }
            },
            {
              node: {
                id: 'gid://shopify/Product/boundary2',
                title: 'Exactly 69% Sustainable',
                handle: 'exactly-69',
                metafields: {
                  edges: [
                    {
                      node: {
                        key: 'sustainable_materials',
                        namespace: 'custom',
                        value: '0.69'
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    }

    mockGraphql.mockResolvedValue({
      json: () => Promise.resolve(boundaryValueProducts)
    })

    const request = new Request('http://localhost/app/sustainablematerials')
    const response = await loader({ request })
    const result = await response.json()

    // 70% should be "Sustainable"
    expect(result.products[0]).toEqual({
      id: 'gid://shopify/Product/boundary1',
      title: 'Exactly 70% Sustainable',
      sustainablePercent: '70',
      badgeLabel: 'Sustainable',
      badgeStatus: 'success'
    })

    // 69% should be "Moderate" 
    expect(result.products[1]).toEqual({
      id: 'gid://shopify/Product/boundary2',
      title: 'Exactly 69% Sustainable',
      sustainablePercent: '69',
      badgeLabel: 'Moderate',
      badgeStatus: 'warning'
    })
  })
})