// tests/unit/sustainableMaterialsUtils.test.js
import { describe, it, expect } from 'vitest'

// Extract the utility functions from the loader for testing
// These would ideally be in separate utility files

/**
 * Extracts a metafield value and converts it to a number
 * @param {Array} metafields - Array of metafield objects
 * @param {string} key - The metafield key to look for
 * @returns {number} - The parsed value or 0 if not found/invalid
 */
function getMetafieldValue(metafields, key) {
  const metafield = metafields.find((m) => m.key === key)
  if (metafield) {
    const value = parseFloat(metafield.value)
    return isNaN(value) ? 0 : value
  }
  return 0
}

/**
 * Calculates badge status and label based on sustainable materials percentage
 * This matches the updated implementation with three categories
 * @param {number} sustainablePercent - Percentage of sustainable materials (0-100)
 * @returns {Object} - Object containing badgeStatus and badgeLabel
 */
function calculateBadgeInfo(sustainablePercent) {
  let badgeStatus = "critical"
  let badgeLabel = "Low"

  if (sustainablePercent >= 70) {
    badgeStatus = "success"
    badgeLabel = "Sustainable"
  } else if (sustainablePercent < 70 && sustainablePercent > 40) {
    badgeStatus = "warning"
    badgeLabel = "Moderate"
  } else {
    badgeStatus = "critical"
    badgeLabel = "Low"
  }

  return { badgeStatus, badgeLabel }
}

/**
 * Converts decimal sustainable materials value to percentage string
 * @param {number} sustainableMaterials - Decimal value (0-1)
 * @returns {string} - Percentage as string with no decimal places
 */
function formatSustainablePercent(sustainableMaterials) {
  return (sustainableMaterials * 100).toFixed(0)
}

describe('Sustainable Materials Utility Functions', () => {
  describe('getMetafieldValue', () => {
    const mockMetafields = [
      { key: 'sustainable_materials', value: '0.75' },
      { key: 'other_field', value: '123' },
      { key: 'text_field', value: 'not_a_number' },
      { key: 'empty_field', value: '' }
    ]

    it('should extract valid numeric metafield value', () => {
      const result = getMetafieldValue(mockMetafields, 'sustainable_materials')
      expect(result).toBe(0.75)
    })

    it('should return 0 for non-existent metafield', () => {
      const result = getMetafieldValue(mockMetafields, 'nonexistent_field')
      expect(result).toBe(0)
    })

    it('should return 0 for invalid numeric value', () => {
      const result = getMetafieldValue(mockMetafields, 'text_field')
      expect(result).toBe(0)
    })

    it('should return 0 for empty value', () => {
      const result = getMetafieldValue(mockMetafields, 'empty_field')
      expect(result).toBe(0)
    })

    it('should handle empty metafields array', () => {
      const result = getMetafieldValue([], 'sustainable_materials')
      expect(result).toBe(0)
    })

    it('should parse integer values correctly', () => {
      const metafields = [{ key: 'test', value: '1' }]
      const result = getMetafieldValue(metafields, 'test')
      expect(result).toBe(1)
    })

    it('should parse decimal values correctly', () => {
      const metafields = [{ key: 'test', value: '0.123456' }]
      const result = getMetafieldValue(metafields, 'test')
      expect(result).toBe(0.123456)
    })
  })

  describe('calculateBadgeInfo', () => {
    it('should return "Sustainable" badge for 70% and above', () => {
      expect(calculateBadgeInfo(70)).toEqual({
        badgeStatus: 'success',
        badgeLabel: 'Sustainable'
      })

      expect(calculateBadgeInfo(85)).toEqual({
        badgeStatus: 'success',
        badgeLabel: 'Sustainable'
      })

      expect(calculateBadgeInfo(100)).toEqual({
        badgeStatus: 'success',
        badgeLabel: 'Sustainable'
      })
    })

    it('should return "Moderate" badge for values between 40-70%', () => {
      expect(calculateBadgeInfo(69)).toEqual({
        badgeStatus: 'warning',
        badgeLabel: 'Moderate'
      })

      expect(calculateBadgeInfo(65)).toEqual({
        badgeStatus: 'warning',
        badgeLabel: 'Moderate'
      })

      expect(calculateBadgeInfo(50)).toEqual({
        badgeStatus: 'warning',
        badgeLabel: 'Moderate'
      })

      expect(calculateBadgeInfo(41)).toEqual({
        badgeStatus: 'warning',
        badgeLabel: 'Moderate'
      })
    })

    it('should return "Low" badge for values 40% and below', () => {
      expect(calculateBadgeInfo(40)).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })

      expect(calculateBadgeInfo(30)).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })

      expect(calculateBadgeInfo(10)).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })

      expect(calculateBadgeInfo(0)).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })
    })

    it('should handle boundary values correctly', () => {
      // Test exact boundaries
      expect(calculateBadgeInfo(70)).toEqual({
        badgeStatus: 'success',
        badgeLabel: 'Sustainable'
      })

      expect(calculateBadgeInfo(40)).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })
    })

    it('should handle decimal percentages', () => {
      expect(calculateBadgeInfo(69.9)).toEqual({
        badgeStatus: 'warning',
        badgeLabel: 'Moderate'
      })

      expect(calculateBadgeInfo(70.1)).toEqual({
        badgeStatus: 'success',
        badgeLabel: 'Sustainable'
      })

      expect(calculateBadgeInfo(40.1)).toEqual({
        badgeStatus: 'warning',
        badgeLabel: 'Moderate'
      })

      expect(calculateBadgeInfo(39.9)).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })
    })
  })

  describe('formatSustainablePercent', () => {
    it('should convert decimal to percentage string', () => {
      expect(formatSustainablePercent(0.75)).toBe('75')
      expect(formatSustainablePercent(0.5)).toBe('50')
      expect(formatSustainablePercent(1.0)).toBe('100')
      expect(formatSustainablePercent(0.0)).toBe('0')
    })

    it('should round to nearest integer', () => {
      expect(formatSustainablePercent(0.756)).toBe('76')
      expect(formatSustainablePercent(0.754)).toBe('75')
      expect(formatSustainablePercent(0.999)).toBe('100')
    })

    it('should handle very small values', () => {
      expect(formatSustainablePercent(0.001)).toBe('0')
      expect(formatSustainablePercent(0.009)).toBe('1')
    })

    it('should handle edge cases', () => {
      expect(formatSustainablePercent(0)).toBe('0')
      expect(formatSustainablePercent(1)).toBe('100')
    })

    it('should handle values over 1 (edge case)', () => {
      // In case of data errors where value > 1
      expect(formatSustainablePercent(1.5)).toBe('150')
    })
  })

  describe('Integration - Full Product Processing', () => {
    it('should process complete product data correctly', () => {
      const metafields = [
        { key: 'sustainable_materials', value: '0.85' }
      ]

      const sustainableMaterials = getMetafieldValue(metafields, 'sustainable_materials')
      const sustainablePercent = formatSustainablePercent(sustainableMaterials)
      const badgeInfo = calculateBadgeInfo(parseFloat(sustainablePercent))

      expect(sustainableMaterials).toBe(0.85)
      expect(sustainablePercent).toBe('85')
      expect(badgeInfo).toEqual({
        badgeStatus: 'success',
        badgeLabel: 'Sustainable'
      })
    })

    it('should handle product with no sustainable materials data', () => {
      const metafields = [
        { key: 'other_field', value: 'some_value' }
      ]

      const sustainableMaterials = getMetafieldValue(metafields, 'sustainable_materials')
      const sustainablePercent = formatSustainablePercent(sustainableMaterials)
      const badgeInfo = calculateBadgeInfo(parseFloat(sustainablePercent))

      expect(sustainableMaterials).toBe(0)
      expect(sustainablePercent).toBe('0')
      expect(badgeInfo).toEqual({
        badgeStatus: 'critical',
        badgeLabel: 'Low'
      })
    })
  })
})