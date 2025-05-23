import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock Shopify Polaris components (since they're complex to test)
vi.mock('@shopify/polaris', () => ({
  Page: ({ children }) => <div data-testid="page">{children}</div>,
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  Text: ({ children, as }) => {
    const Tag = as || 'span'
    return <Tag>{children}</Tag>
  },
  Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>
}))

// Simple component to test (based on your app structure)
function ProductSummary({ products = [] }) {
  const totalProducts = products.length
  const localProducts = products.filter(p => p.isLocallyProduced).length
  const avgSustainability = products.length > 0 
    ? products.reduce((sum, p) => sum + (p.sustainableMaterials || 0), 0) / products.length
    : 0

  return (
    <div data-testid="product-summary">
      <h2>Sustainability Summary</h2>
      <p>Total Products: {totalProducts}</p>
      <p>Local Products: {localProducts}</p>
      <p>Avg Sustainability: {Math.round(avgSustainability * 100)}%</p>
    </div>
  )
}

describe('ProductSummary Component', () => {
  it('renders with no products', () => {
    render(<ProductSummary products={[]} />)
    
    expect(screen.getByText('Total Products: 0')).toBeInTheDocument()
    expect(screen.getByText('Local Products: 0')).toBeInTheDocument()
    expect(screen.getByText('Avg Sustainability: 0%')).toBeInTheDocument()
  })

  it('calculates metrics correctly with sample products', () => {
    const sampleProducts = [
      { id: '1', isLocallyProduced: true, sustainableMaterials: 0.8 },
      { id: '2', isLocallyProduced: false, sustainableMaterials: 0.6 },
      { id: '3', isLocallyProduced: true, sustainableMaterials: 0.9 }
    ]

    render(<ProductSummary products={sampleProducts} />)
    
    expect(screen.getByText('Total Products: 3')).toBeInTheDocument()
    expect(screen.getByText('Local Products: 2')).toBeInTheDocument()
    expect(screen.getByText('Avg Sustainability: 77%')).toBeInTheDocument() // (0.8+0.6+0.9)/3 = 0.77
  })
})