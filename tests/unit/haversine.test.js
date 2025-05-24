// tests/unit/haversine.test.js
import { describe, it, expect } from 'vitest'
import haversine from '~/utils/haversine'

describe('Haversine Distance Calculator', () => {
  it('should calculate correct distance between Copenhagen and Malmö', () => {
    // Copenhagen: 55.6761°N, 12.5683°E
    // Malmö: 55.6050°N, 12.9940°E
    // Actual distance: ~27.86 km
    const distance = haversine(55.6761, 12.5683, 55.6050, 12.9940)
    expect(distance).toBeCloseTo(27.86, 1)
  })

  it('should calculate correct distance between Copenhagen and Stockholm', () => {
    // Copenhagen: 55.6761°N, 12.5683°E
    // Stockholm: 59.3293°N, 18.0686°E
    // Actual distance: ~522.13 km
    const distance = haversine(55.6761, 12.5683, 59.3293, 18.0686)
    expect(distance).toBeCloseTo(522.13, 1)
  })

  it('should return 0 for same coordinates', () => {
    const distance = haversine(55.6761, 12.5683, 55.6761, 12.5683)
    expect(distance).toBe(0)
  })

  it('should handle negative coordinates correctly', () => {
    // Test with coordinates in southern hemisphere
    // Buenos Aires: -34.6037°S, -58.3816°W
    // Montevideo: -34.9011°S, -56.1645°W
    // Actual distance: ~205.23 km
    const distance = haversine(-34.6037, -58.3816, -34.9011, -56.1645)
    expect(distance).toBeCloseTo(205.23, 1)
  })

  it('should handle coordinates across 180° meridian', () => {
    // Test coordinates that cross the international date line
    // Fiji: -18.1248°S, 178.4501°E
    // Samoa: -13.7590°S, -172.1046°W (equivalent to 187.8954°E)
    const distance = haversine(-18.1248, 178.4501, -13.7590, -172.1046)
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThan(2000) // Should be reasonable distance
  })

  it('should handle very small distances accurately', () => {
    // Two points very close together (about 0.11 km apart)
    const lat1 = 55.6761
    const lon1 = 12.5683
    const lat2 = 55.6771 // ~0.1 degree north ≈ 0.11 km
    const lon2 = 12.5683
    
    const distance = haversine(lat1, lon1, lat2, lon2)
    expect(distance).toBeCloseTo(0.11, 2)
  })

  it('should handle maximum distance (antipodal points)', () => {
    // Test points on opposite sides of Earth
    // North Pole to South Pole through 0° meridian
    const distance = haversine(90, 0, -90, 0)
    expect(distance).toBeCloseTo(20015, 0) // Half Earth's circumference ≈ 20,015 km
  })

  it('should be commutative (distance A to B = distance B to A)', () => {
    const lat1 = 55.6761, lon1 = 12.5683  // Copenhagen
    const lat2 = 59.3293, lon2 = 18.0686  // Stockholm
    
    const distanceAB = haversine(lat1, lon1, lat2, lon2)
    const distanceBA = haversine(lat2, lon2, lat1, lon1)
    
    expect(distanceAB).toBeCloseTo(distanceBA, 10)
  })

  it('should handle edge case coordinates', () => {
    // Test edge cases like equator, prime meridian, etc.
    const distanceEquator = haversine(0, 0, 0, 1) // 1 degree along equator
    expect(distanceEquator).toBeCloseTo(111.3, 0) // ~111 km per degree at equator
    
    const distancePrimeMeridian = haversine(0, 0, 1, 0) // 1 degree along prime meridian
    expect(distancePrimeMeridian).toBeCloseTo(111.3, 0) // ~111 km per degree
  })

  it('should handle decimal precision correctly', () => {
    // Test with high precision coordinates
    const distance = haversine(
      55.676098, 12.568337,  // Very precise Copenhagen
      55.676099, 12.568338   // 1 meter difference
    )
    expect(distance).toBeLessThan(0.01) // Should be very small distance
    expect(distance).toBeGreaterThan(0) // But not zero
  })
})